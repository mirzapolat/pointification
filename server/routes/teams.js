// Team-level routes. Access is derived from the team's parent game.
import express from 'express'
import { all, get, run } from '../db.js'
import { serializeTeam } from '../lib/serialize.js'
import { badRequest, forbidden, notFound, wrap, requireString } from '../lib/http.js'
import { requireAuth, hasGameAccess } from '../lib/auth.js'
import { publish } from '../lib/events.js'
import { applyPointChange } from '../lib/points.js'

const router = express.Router()
router.use(requireAuth)

const loadTeam = wrap(async (req, _res, next) => {
  const row = get('SELECT * FROM teams WHERE id = ?', req.params.id)
  if (!row) throw notFound('Team not found.')
  if (!hasGameAccess(row.game_id, req.user.id)) throw forbidden('You do not have access to this game.')
  req.team = row
  next()
})

const TEAM_PATCH = {
  name: (v) => requireString(v, 'Team name'),
  color: (v) => String(v),
  position: (v) => {
    const n = Number(v)
    if (!Number.isInteger(n)) throw badRequest('Position must be a whole number.')
    return n
  },
}

router.patch('/:id', loadTeam, wrap(async (req, res) => {
  const body = req.body ?? {}
  const sets = []
  const values = []
  for (const [key, coerce] of Object.entries(TEAM_PATCH)) {
    if (!(key in body)) continue
    sets.push(`${key} = ?`)
    values.push(coerce(body[key]))
  }
  if (!sets.length) throw badRequest('Nothing to update.')
  values.push(req.team.id)
  run(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`, ...values)

  const team = serializeTeam(get('SELECT * FROM teams WHERE id = ?', req.team.id))
  publish(req.team.game_id, { table: 'teams', type: 'UPDATE', row: team })
  res.json({ team })
}))

router.delete('/:id', loadTeam, wrap(async (req, res) => {
  run('DELETE FROM teams WHERE id = ?', req.team.id)
  publish(req.team.game_id, { table: 'teams', type: 'DELETE', row: null, old: { id: req.team.id } })
  res.json({ ok: true })
}))

// POST /api/teams/:id/points — the atomic score change + log write.
router.post('/:id/points', loadTeam, wrap(async (req, res) => {
  const delta = Number(req.body?.delta)
  if (!Number.isFinite(delta) || delta === 0) throw badRequest('Delta must be a non-zero number.')

  const { log, team } = applyPointChange({
    teamId: req.team.id, delta, userId: req.user.id, userEmail: req.user.email,
  })
  if (log) {
    publish(req.team.game_id, { table: 'teams', type: 'UPDATE', row: serializeTeam(team) })
    publish(req.team.game_id, { table: 'point_logs', type: 'INSERT', row: log })
  }
  res.json({ log, team: serializeTeam(team) })
}))

export default router
