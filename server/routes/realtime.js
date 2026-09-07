// Server-Sent Events streams. One connection per screen; the server decides
// what each stream is allowed to see.
import express from 'express'
import { forbidden, notFound, wrap } from '../lib/http.js'
import { hasGameAccess, requireAuth } from '../lib/auth.js'
import { addClient } from '../lib/events.js'
import { findPublicGame } from './public.js'

const router = express.Router()

// GET /api/realtime/games — anything the signed-in user can see changed.
router.get('/games', requireAuth, (req, res) => {
  addClient(req, res, { kind: 'list', userId: req.user.id })
})

// GET /api/realtime/games/:id — one game, for collaborators.
router.get('/games/:id', requireAuth, wrap(async (req, res) => {
  if (!hasGameAccess(req.params.id, req.user.id)) throw forbidden('You do not have access to this game.')
  addClient(req, res, { kind: 'game', gameId: req.params.id, userId: req.user.id })
}))

// GET /api/realtime/public/:token — anonymous viewers of a shared game.
router.get('/public/:token', wrap(async (req, res) => {
  const game = findPublicGame(req.params.token)
  if (!game) throw notFound('This scoreboard is not shared.')
  addClient(req, res, { kind: 'public', gameId: game.id })
}))

export default router