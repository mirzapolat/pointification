// In-process pub/sub behind Server-Sent Events. This replaces Supabase
// Realtime: writes publish a change, and every open SSE stream that is allowed
// to see that change receives it.
//
// Single-process by design — the app runs as one container. If it ever needs to
// scale horizontally, this is the one module that has to grow a shared bus.
import { hasGameAccess } from './auth.js'

/** @type {Set<{res: import('express').Response, kind: string, gameId: string|null, userId: string|null}>} */
const clients = new Set()

// Anonymous viewers of a shared game only ever need the presentation fields.
const PUBLIC_GAME_FIELDS = [
  'id', 'name', 'is_public', 'public_token',
  'logo_path', 'logo_placement', 'logo_shape', 'logo_scale', 'team_sort',
]

function projectForPublic(payload) {
  if (payload.table !== 'games') return payload
  if (!payload.row) return payload
  const row = {}
  for (const key of PUBLIC_GAME_FIELDS) row[key] = payload.row[key]
  return { ...payload, row }
}

const write = (client, event, data) => {
  try {
    const body = client.kind === 'public' ? projectForPublic(data) : data
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`)
  } catch {
    clients.delete(client)
  }
}

/**
 * Announce a change to everyone watching this game.
 *
 * @param {string} gameId
 * @param {{table: string, type: 'INSERT'|'UPDATE'|'DELETE', row?: object, old?: object}} change
 * @param {{userIds?: string[]}} [opts] extra users to notify on their list
 *   stream even when they can no longer read the game (removals, deletions).
 */
export function publish(gameId, change, opts = {}) {
  const payload = { game_id: gameId, ...change }
  const extra = new Set(opts.userIds ?? [])
  for (const client of clients) {
    if (client.kind === 'public') {
      // Anonymous viewers see the scoreboard only — never logs or membership.
      if (client.gameId === gameId && (change.table === 'games' || change.table === 'teams')) {
        write(client, 'change', payload)
      }
    } else if (client.kind === 'game') {
      if (client.gameId === gameId) write(client, 'change', payload)
    } else if (client.kind === 'list') {
      if (extra.has(client.userId) || hasGameAccess(gameId, client.userId)) {
        write(client, 'change', payload)
      }
    }
  }
}

/** Registers an SSE stream and returns a teardown function. */
export function addClient(req, res, { kind, gameId = null, userId = null }) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Tells nginx/Traefik-style proxies not to buffer the stream.
    'x-accel-buffering': 'no',
  })
  res.write(': connected\n\n')

  const client = { res, kind, gameId, userId }
  clients.add(client)

  // Comment-only heartbeat keeps intermediaries from closing an idle stream.
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n') } catch { /* closed */ }
  }, 25_000)

  const close = () => {
    clearInterval(heartbeat)
    clients.delete(client)
  }
  req.on('close', close)
  res.on('close', close)
  return close
}

export const clientCount = () => clients.size
