// Round-level routes. Access is derived from the round's parent game.
import express from 'express'
import { get, run, tx, nowIso } from '../db.js'
import { serializeRound, serializeGame } from '../lib/serialize.js'
import { badRequest, forbidden, notFound, wrap, requireString } from '../lib/http.js'
import { requireAuth, hasGameAccess } from '../lib/auth.js'
import { publish } from '../lib/events.js'

const router = express.Router()
router.use(requireAuth)

const loadRound = wrap(async (req, _res, next) => {
  const row = get('SELECT * FROM rounds WHERE id = ?', req.params.id)
  if (!row) throw notFound('Round not found.')
  if (!hasGameAccess(row.game_id, req.user.id)) throw forbidden('You do not have access to this game.')
  req.round = row
  next()
})

const ROUND_PATCH = {
  name: (v) => requireString(v, 'Round name'),
  position: (v) => {
    const n = Number(v)
    if (!Number.isInteger(n)) throw badRequest('Position must be a whole number.')
    return n
  },
}

router.patch('/:id', loadRound, wrap(async (req, res) => {
  const body = req.body ?? {}
  const sets = []
  const values = []
  for (const [key, coerce] of Object.entries(ROUND_PATCH)) {
    if (!(key in body)) continue
    sets.push(`${key} = ?`)
    values.push(coerce(body[key]))
  }
  if (!sets.length) throw badRequest('Nothing to update.')
  values.push(req.round.id)
  run(`UPDATE rounds SET ${sets.join(', ')} WHERE id = ?`, ...values)

  const round = serializeRound(get('SELECT * FROM rounds WHERE id = ?', req.round.id))
  publish(req.round.game_id, { table: 'rounds', type: 'UPDATE', row: round })
  res.json({ round })
}))

router.delete('/:id', loadRound, wrap(async (req, res) => {
  const gameId = req.round.game_id
  // Postgres did this via ON DELETE SET NULL; keep the same effect explicitly
  // so the game never points at a round that is gone.
  const clearedCurrent = tx(() => {
    run('DELETE FROM rounds WHERE id = ?', req.round.id)
    const game = get('SELECT current_round_id FROM games WHERE id = ?', gameId)
    if (game?.current_round_id === req.round.id) {
      run('UPDATE games SET current_round_id = NULL, updated_at = ? WHERE id = ?', nowIso(), gameId)
      return true
    }
    return false
  })

  publish(gameId, { table: 'rounds', type: 'DELETE', row: null, old: { id: req.round.id } })
  if (clearedCurrent) {
    publish(gameId, {
      table: 'games', type: 'UPDATE',
      row: serializeGame(get('SELECT * FROM games WHERE id = ?', gameId)),
    })
  }
  res.json({ ok: true })
}))

export default router
