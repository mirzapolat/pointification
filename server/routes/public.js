// Read-only endpoints for shared game links. No authentication: possession of
// the token is the credential, exactly as the old anon RLS policies intended.
import express from 'express'
import { all, get } from '../db.js'
import { serializeGame, serializeTeam } from '../lib/serialize.js'
import { notFound, wrap } from '../lib/http.js'

const router = express.Router()

const PUBLIC_GAME_FIELDS = [
  'id', 'name', 'is_public', 'public_token',
  'logo_path', 'logo_placement', 'logo_shape', 'logo_scale', 'team_sort',
]

/** The row behind a share token, or null when sharing is off / unknown. */
export function findPublicGame(token) {
  if (!token) return null
  return get('SELECT * FROM games WHERE public_token = ? AND is_public = 1', String(token))
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

export default router
