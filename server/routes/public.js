// Read-only endpoints for shared game links. No authentication: possession of
// the token is the credential, exactly as the old anon RLS policies intended.
import express from 'express'
import { all, get } from '../db.js'
import { serializeGame, serializeTeam, serializeRound, serializePublicLog, PUBLIC_GAME_FIELDS } from '../lib/serialize.js'
import { LOG_SELECT } from '../lib/points.js'
import { notFound, wrap } from '../lib/http.js'

const router = express.Router()

/** The row behind a share token, or null when sharing is off / unknown. */
export function findPublicGame(token) {
  if (!token) return null
  return get(
    'SELECT * FROM games WHERE public_token = ? AND is_public = 1 AND deleted_at IS NULL',
    String(token)
  )
}

export function publicGameView(row) {
  const full = serializeGame(row)
  const view = {}
  for (const key of PUBLIC_GAME_FIELDS) view[key] = full[key]
  return view
}

// GET /api/public/:token — the scoreboard behind a share link.
router.get('/:token', wrap(async (req, res) => {
  const row = findPublicGame(req.params.token)
  if (!row) throw notFound('This scoreboard is not shared.')
  res.json({
    game: publicGameView(row),
    teams: all('SELECT * FROM teams WHERE game_id = ? ORDER BY position', row.id).map(serializeTeam),
  })
}))

// GET /api/public/:token/log — the audit log, when the owner opted in.
// Names only: no emails, no account ids.
router.get('/:token/log', wrap(async (req, res) => {
  const row = findPublicGame(req.params.token)
  if (!row || row.public_log !== 1) throw notFound('This log is not shared.')
  res.json({
    game: publicGameView(row),
    teams: all('SELECT * FROM teams WHERE game_id = ? ORDER BY position', row.id).map(serializeTeam),
    rounds: row.rounds_enabled
      ? all('SELECT * FROM rounds WHERE game_id = ? ORDER BY position', row.id).map(serializeRound)
      : [],
    logs: all(`${LOG_SELECT} ORDER BY l.created_at, l.id`, row.id).map(serializePublicLog),
  })
}))

export default router
