// Games and everything nested under one: teams, rounds, logs, sharing,
// collaborators and the logo file.
import crypto from 'node:crypto'
import express from 'express'
import { all, get, run, tx, nowIso } from '../db.js'
import { serializeGame, serializeTeam, serializeRound, serializeLog } from '../lib/serialize.js'
import { badRequest, forbidden, notFound, wrap, requireString } from '../lib/http.js'
import { requireAuth, hasGameAccess } from '../lib/auth.js'
import { publish } from '../lib/events.js'
import { undoLastPointChange } from '../lib/points.js'
import { saveLogo, deleteLogo, deleteLogoDir, allowedTypes } from '../lib/logos.js'

const router = express.Router()
router.use(requireAuth)

const MAX_PRESETS = 24

// --- Shared helpers ------------------------------------------------------

/** Loads :id and asserts the caller is the owner or a collaborator. */
const loadGame = wrap(async (req, _res, next) => {
  const row = get('SELECT * FROM games WHERE id = ?', req.params.id)
  if (!row) throw notFound('Game not found.')
  if (!hasGameAccess(row.id, req.user.id)) throw forbidden('You do not have access to this game.')
  req.game = row
  next()
})

const requireOwner = (req, _res, next) => {
  if (req.game.user_id !== req.user.id) return next(forbidden('Only the game owner can do that.'))
  next()
}

const touchGame = (id) => run('UPDATE games SET updated_at = ? WHERE id = ?', nowIso(), id)

/** Everyone who should hear about a change even after losing read access. */
const audience = (gameId) => [
  ...all('SELECT user_id FROM games WHERE id = ?', gameId).map(r => r.user_id),
  ...all('SELECT user_id FROM game_members WHERE game_id = ?', gameId).map(r => r.user_id),
]

const emitGame = (id, type, extraUserIds) => {
  const row = type === 'DELETE' ? null : get('SELECT * FROM games WHERE id = ?', id)
  publish(id, { table: 'games', type, row: serializeGame(row), old: { id } },
    extraUserIds ? { userIds: extraUserIds } : undefined)
}

function parsePresets(value) {
  if (!Array.isArray(value)) throw badRequest('Point presets must be a list of numbers.')
  const cleaned = value.map(Number).filter(Number.isFinite).map(Math.trunc)
  if (cleaned.length !== value.length) throw badRequest('Point presets must all be numbers.')
  if (cleaned.length > MAX_PRESETS) throw badRequest(`At most ${MAX_PRESETS} point presets.`)
  if (cleaned.some(v => v === 0)) throw badRequest('Point presets cannot be zero.')
  return JSON.stringify(cleaned)
}

// --- Games ---------------------------------------------------------------

// GET /api/games — everything the user owns or collaborates on, teams embedded.
router.get('/', wrap(async (req, res) => {
  const games = all(
    `SELECT g.* FROM games g
      WHERE g.user_id = ?
         OR EXISTS (SELECT 1 FROM game_members m WHERE m.game_id = g.id AND m.user_id = ?)
      ORDER BY g.updated_at DESC`,
    req.user.id, req.user.id
  ).map(serializeGame)

  if (games.length) {
    const teamsByGame = new Map(games.map(g => [g.id, []]))
    const placeholders = games.map(() => '?').join(',')
    for (const t of all(
      `SELECT * FROM teams WHERE game_id IN (${placeholders}) ORDER BY position`,
      ...games.map(g => g.id)
    )) {
      teamsByGame.get(t.game_id)?.push(serializeTeam(t))
    }
    for (const g of games) g.teams = teamsByGame.get(g.id) ?? []
  }
  res.json({ games })
}))

// POST /api/games
router.post('/', wrap(async (req, res) => {
  const name = requireString(req.body?.name, 'Game name')
  const id = crypto.randomUUID()
  const ts = nowIso()
  run('INSERT INTO games (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    id, req.user.id, name, ts, ts)
  emitGame(id, 'INSERT')
  res.status(201).json({ game: serializeGame(get('SELECT * FROM games WHERE id = ?', id)) })
}))

// GET /api/games/:id — the game with its teams and rounds.
router.get('/:id', loadGame, wrap(async (req, res) => {
  const game = serializeGame(req.game)
  game.teams = all('SELECT * FROM teams WHERE game_id = ? ORDER BY position', game.id).map(serializeTeam)
  game.rounds = all('SELECT * FROM rounds WHERE game_id = ? ORDER BY position', game.id).map(serializeRound)
  res.json({ game })
}))

// PATCH /api/games/:id — collaborators may edit settings; sharing stays owner-only.
const GAME_PATCH = {
  name: (v) => requireString(v, 'Game name'),
  allow_negative: (v) => (v ? 1 : 0),
  rounds_enabled: (v) => (v ? 1 : 0),
  archived_at: (v) => (v ? String(v) : null),
  current_round_id: (v) => (v ? String(v) : null),
  logo_placement: (v) => {
    if (v === null) return null
    if (!['center', 'top', 'menu'].includes(v)) throw badRequest('Unknown logo placement.')
    return v
  },
  logo_shape: (v) => {
    if (!['circle', 'square'].includes(v)) throw badRequest('Unknown logo shape.')
    return v
  },
  logo_scale: (v) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0.4 || n > 1.6) throw badRequest('Logo scale must be between 0.4 and 1.6.')
    return n
  },
  team_sort: (v) => {
    if (!['manual', 'asc', 'desc'].includes(v)) throw badRequest('Unknown team sort.')
    return v
  },
  point_presets: parsePresets,
  logo_path: (v) => (v ? String(v) : null),
}

router.patch('/:id', loadGame, wrap(async (req, res) => {
  const body = req.body ?? {}
  const sets = []
  const values = []
  for (const [key, coerce] of Object.entries(GAME_PATCH)) {
    if (!(key in body)) continue
    sets.push(`${key} = ?`)
    values.push(coerce(body[key]))
  }
  if (!sets.length) throw badRequest('Nothing to update.')

  // Clearing the logo path also removes the file it pointed at.
  if ('logo_path' in body && !body.logo_path && req.game.logo_path) {
    deleteLogo(req.game.logo_path)
  }

  sets.push('updated_at = ?')
  values.push(nowIso(), req.game.id)
  run(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`, ...values)
  emitGame(req.game.id, 'UPDATE')
  res.json({ game: serializeGame(get('SELECT * FROM games WHERE id = ?', req.game.id)) })
}))

// DELETE /api/games/:id
router.delete('/:id', loadGame, requireOwner, wrap(async (req, res) => {
  const watchers = audience(req.game.id)
  run('DELETE FROM games WHERE id = ?', req.game.id)
  deleteLogoDir(`${req.game.user_id}/${req.game.id}`)
  emitGame(req.game.id, 'DELETE', watchers)
  res.json({ ok: true })
}))

// --- Sharing -------------------------------------------------------------

router.post('/:id/sharing', loadGame, requireOwner, wrap(async (req, res) => {
  const enabled = !!req.body?.enabled
  const token = enabled && !req.game.public_token ? crypto.randomUUID() : req.game.public_token
  run('UPDATE games SET is_public = ?, public_token = ?, updated_at = ? WHERE id = ?',
    enabled ? 1 : 0, token, nowIso(), req.game.id)
  emitGame(req.game.id, 'UPDATE')
  res.json({ game: serializeGame(get('SELECT * FROM games WHERE id = ?', req.game.id)) })
}))

router.post('/:id/rotate-token', loadGame, requireOwner, wrap(async (req, res) => {
  run('UPDATE games SET public_token = ?, updated_at = ? WHERE id = ?',
    crypto.randomUUID(), nowIso(), req.game.id)
  emitGame(req.game.id, 'UPDATE')
  res.json({ game: serializeGame(get('SELECT * FROM games WHERE id = ?', req.game.id)) })
}))

// --- Logo ----------------------------------------------------------------

// PUT /api/games/:id/logo — raw image body (see express.raw in index.js).
router.put('/:id/logo', loadGame, requireOwner, wrap(async (req, res) => {
  const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim()
  if (!allowedTypes().includes(contentType)) {
    throw badRequest(`Unsupported image type. Use one of: ${allowedTypes().join(', ')}.`)
  }
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('No image data received.')

  const relPath = saveLogo({
    userId: req.user.id, gameId: req.game.id, buffer: req.body, contentType,
  })
  if (!relPath) throw badRequest('Could not store that image.')

  const previous = req.game.logo_path
  const placement = req.game.logo_placement ?? 'center'
  run('UPDATE games SET logo_path = ?, logo_placement = ?, updated_at = ? WHERE id = ?',
    relPath, placement, nowIso(), req.game.id)
  if (previous && previous !== relPath) deleteLogo(previous)
  emitGame(req.game.id, 'UPDATE')
  res.json({ game: serializeGame(get('SELECT * FROM games WHERE id = ?', req.game.id)) })
}))

router.delete('/:id/logo', loadGame, requireOwner, wrap(async (req, res) => {
  if (req.game.logo_path) deleteLogo(req.game.logo_path)
  run('UPDATE games SET logo_path = NULL, logo_placement = NULL, updated_at = ? WHERE id = ?',
    nowIso(), req.game.id)
  emitGame(req.game.id, 'UPDATE')
  res.json({ game: serializeGame(get('SELECT * FROM games WHERE id = ?', req.game.id)) })
}))

// --- Teams ---------------------------------------------------------------

router.get('/:id/teams', loadGame, wrap(async (req, res) => {
  res.json({
    teams: all('SELECT * FROM teams WHERE game_id = ? ORDER BY position', req.game.id).map(serializeTeam),
  })
}))

// POST /api/games/:id/teams — accepts one team or a list, created in order.
router.post('/:id/teams', loadGame, wrap(async (req, res) => {
  const input = Array.isArray(req.body?.teams) ? req.body.teams : [req.body ?? {}]
  if (!input.length) throw badRequest('No teams to create.')

  const created = tx(() => input.map((t, i) => {
    const id = crypto.randomUUID()
    run(
      'INSERT INTO teams (id, game_id, name, color, score, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, req.game.id, requireString(t.name, 'Team name'), String(t.color ?? '#FFD93D'),
      Math.trunc(Number(t.score ?? 0)) || 0,
      Number.isFinite(Number(t.position)) ? Math.trunc(Number(t.position)) : i,
      nowIso()
    )
    return serializeTeam(get('SELECT * FROM teams WHERE id = ?', id))
  }))

  touchGame(req.game.id)
  for (const team of created) publish(req.game.id, { table: 'teams', type: 'INSERT', row: team })
  res.status(201).json({ teams: created })
}))

// --- Rounds --------------------------------------------------------------

router.get('/:id/rounds', loadGame, wrap(async (req, res) => {
  res.json({
    rounds: all('SELECT * FROM rounds WHERE game_id = ? ORDER BY position', req.game.id).map(serializeRound),
  })
}))

router.post('/:id/rounds', loadGame, wrap(async (req, res) => {
  const input = Array.isArray(req.body?.rounds) ? req.body.rounds : [req.body ?? {}]
  if (!input.length) throw badRequest('No rounds to create.')

  const created = tx(() => input.map((r, i) => {
    const id = crypto.randomUUID()
    run('INSERT INTO rounds (id, game_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
      id, req.game.id, String(r.name ?? '').trim() || `Round ${i + 1}`,
      Number.isFinite(Number(r.position)) ? Math.trunc(Number(r.position)) : i,
      nowIso())
    return serializeRound(get('SELECT * FROM rounds WHERE id = ?', id))
  }))

  for (const round of created) publish(req.game.id, { table: 'rounds', type: 'INSERT', row: round })
  res.status(201).json({ rounds: created })
}))

// --- Point logs ----------------------------------------------------------

// GET /api/games/:id/logs[?round_id=…] — full history, oldest first.
router.get('/:id/logs', loadGame, wrap(async (req, res) => {
  const roundId = req.query.round_id
  const select = `SELECT l.*, u.email AS user_email
                    FROM point_logs l LEFT JOIN users u ON u.id = l.user_id
                   WHERE l.game_id = ?`
  const rows = roundId
    ? all(`${select} AND l.round_id = ? ORDER BY l.created_at, l.id`, req.game.id, String(roundId))
    : all(`${select} ORDER BY l.created_at, l.id`, req.game.id)
  res.json({ logs: rows.map(serializeLog) })
}))

// POST /api/games/:id/undo — reverse the most recent change.
router.post('/:id/undo', loadGame, wrap(async (req, res) => {
  const { log, team } = undoLastPointChange(req.game.id)
  if (log) {
    if (team) publish(req.game.id, { table: 'teams', type: 'UPDATE', row: serializeTeam(team) })
    publish(req.game.id, { table: 'point_logs', type: 'DELETE', row: null, old: log })
  }
  res.json({ log, team: serializeTeam(team) })
}))

// --- Collaborators -------------------------------------------------------

router.get('/:id/members', loadGame, wrap(async (req, res) => {
  const members = all(
    `SELECT m.user_id, m.created_at, u.email, u.display_name
       FROM game_members m JOIN users u ON u.id = m.user_id
      WHERE m.game_id = ? ORDER BY m.created_at`,
    req.game.id
  ).map(r => ({
    user_id: r.user_id,
    created_at: r.created_at,
    email: r.email,
    display_name: r.display_name ?? null,
  }))
  res.json({ members })
}))

// POST /api/games/:id/members — invite by email.
router.post('/:id/members', loadGame, requireOwner, wrap(async (req, res) => {
  const email = requireString(req.body?.email, 'Email').toLowerCase()
  const invitee = get('SELECT id, allow_invites FROM users WHERE email_lower = ?', email)
  if (!invitee) throw badRequest('No account with that email.')
  if (invitee.id === req.game.user_id) throw badRequest('You already own this game.')
  if (!invitee.allow_invites) throw badRequest('This user does not accept game invites.')

  run(
    `INSERT INTO game_members (game_id, user_id, added_by, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(game_id, user_id) DO NOTHING`,
    req.game.id, invitee.id, req.user.id, nowIso()
  )
  publish(req.game.id, { table: 'game_members', type: 'INSERT', row: { game_id: req.game.id, user_id: invitee.id } },
    { userIds: [invitee.id] })
  res.status(201).json({ ok: true })
}))

// DELETE /api/games/:id/members/:userId — owner removes, or a member leaves.
router.delete('/:id/members/:userId', loadGame, wrap(async (req, res) => {
  const target = req.params.userId
  const isOwner = req.game.user_id === req.user.id
  if (!isOwner && target !== req.user.id) throw forbidden('Only the owner can remove collaborators.')

  const existing = get('SELECT 1 AS ok FROM game_members WHERE game_id = ? AND user_id = ?', req.game.id, target)
  if (!existing) throw notFound('That collaborator is not on this game.')

  run('DELETE FROM game_members WHERE game_id = ? AND user_id = ?', req.game.id, target)
  publish(req.game.id, { table: 'game_members', type: 'DELETE', row: null, old: { game_id: req.game.id, user_id: target } },
    { userIds: [target, req.game.user_id] })
  res.json({ ok: true })
}))

export default router