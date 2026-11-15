// The two operations that used to be Postgres SECURITY DEFINER functions:
// applying a scored delta and undoing the most recent one. Both must be atomic
// (score + log move together), so they run inside a transaction.
import crypto from 'node:crypto'
import { get, run, tx, nowIso } from '../db.js'
import { serializeLog } from './serialize.js'
import { notFound } from './http.js'

/** Log rows joined with who made (and who undid) each change. Append filters. */
// A user's own display name wins; the owner's nickname for them is the fallback.
export const EFFECTIVE_NAME = (u, m) => `COALESCE(NULLIF(TRIM(${u}.display_name), ''), NULLIF(TRIM(${m}.nickname), ''))`

export const LOG_SELECT = `SELECT l.*, u.email AS user_email, ${EFFECTIVE_NAME('u', 'gm')} AS user_name,
                                  ${EFFECTIVE_NAME('ub', 'gmb')} AS undone_by_name
                             FROM point_logs l
                             LEFT JOIN users u  ON u.id  = l.user_id
                             LEFT JOIN users ub ON ub.id = l.undone_by
                             LEFT JOIN game_members gm  ON gm.game_id  = l.game_id AND gm.user_id  = l.user_id
                             LEFT JOIN game_members gmb ON gmb.game_id = l.game_id AND gmb.user_id = l.undone_by
                            WHERE l.game_id = ?`

/** The name to show for `user` in `gameId`: their own, else the owner's nickname. */
export function nameInGame(gameId, user) {
  const own = user?.display_name?.trim()
  if (own) return own
  if (!user?.id) return null
  const row = get('SELECT nickname FROM game_members WHERE game_id = ? AND user_id = ?', gameId, user.id)
  return row?.nickname?.trim() || null
}

/**
 * Adds `delta` to a team's score and records a log entry.
 * When the game disallows negatives the delta is clamped so the score floors
 * at 0; a clamp to zero is a no-op and writes no log.
 *
 * @returns {{log: object|null, team: object}} the new log (null on no-op)
 */
export function applyPointChange({ teamId, delta, userId, userEmail = null, userName = null }) {
  return tx(() => {
    const row = get(
      `SELECT t.id, t.game_id, t.score, g.allow_negative, g.rounds_enabled, g.current_round_id
         FROM teams t JOIN games g ON g.id = t.game_id
        WHERE t.id = ?`,
      teamId
    )
    if (!row) throw notFound('Team not found.')

    let effective = Math.trunc(delta)
    if (!row.allow_negative && row.score + effective < 0) effective = -row.score
    if (effective === 0) {
      return { log: null, team: get('SELECT * FROM teams WHERE id = ?', teamId) }
    }

    const newScore = row.score + effective
    run('UPDATE teams SET score = ? WHERE id = ?', newScore, teamId)

    const log = {
      id: crypto.randomUUID(),
      team_id: teamId,
      game_id: row.game_id,
      user_id: userId,
      round_id: row.rounds_enabled ? row.current_round_id ?? null : null,
      delta: effective,
      new_score: newScore,
      created_at: nowIso(),
    }
    run(
      `INSERT INTO point_logs (id, team_id, game_id, user_id, round_id, delta, new_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      log.id, log.team_id, log.game_id, log.user_id, log.round_id, log.delta, log.new_score, log.created_at
    )
    return {
      log: serializeLog({ ...log, user_email: userEmail, user_name: userName }),
      team: get('SELECT * FROM teams WHERE id = ?', teamId),
    }
  })
}

/**
 * Reverses the newest logged change for a game and marks its log row as
 * undone (kept for the audit log), so repeated calls walk history back. Scoped to the active round when rounds are
 * on. Returns nulls when there is nothing to undo.
 */
export function undoLastPointChange(gameId, userId = null) {
  return tx(() => {
    const game = get('SELECT rounds_enabled, current_round_id FROM games WHERE id = ?', gameId)
    if (!game) throw notFound('Game not found.')

    const log = game.rounds_enabled
      ? get(
          `SELECT * FROM point_logs
            WHERE game_id = ? AND round_id IS ? AND undone_at IS NULL
            ORDER BY created_at DESC, id DESC LIMIT 1`,
          gameId, game.current_round_id ?? null
        )
      : get(
          'SELECT * FROM point_logs WHERE game_id = ? AND undone_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1',
          gameId
        )
    if (!log) return { log: null, team: null }

    const team = get(
      `SELECT t.*, g.allow_negative FROM teams t JOIN games g ON g.id = t.game_id WHERE t.id = ?`,
      log.team_id
    )
    if (team) {
      let newScore = team.score - log.delta
      if (!team.allow_negative && newScore < 0) newScore = 0
      run('UPDATE teams SET score = ? WHERE id = ?', newScore, team.id)
    }
    run('UPDATE point_logs SET undone_at = ?, undone_by = ? WHERE id = ?', nowIso(), userId, log.id)

    return {
      log: serializeLog(log),
      team: team ? get('SELECT * FROM teams WHERE id = ?', team.id) : null,
    }
  })
}
