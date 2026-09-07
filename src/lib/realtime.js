// Live updates over Server-Sent Events — the replacement for Supabase Realtime.
//
// The server decides what each stream may see, so a subscriber only says which
// scoreboard it is watching and reacts to the changes that arrive. Every event
// is `{ game_id, table, type, row, old }`, where `type` is INSERT | UPDATE |
// DELETE and `row` / `old` hold the new and previous shapes of the record.

/**
 * Opens a stream and routes its events to `handlers`.
 *
 * @param {string} path        one of the /api/realtime/* endpoints
 * @param {Record<string, (change: object) => void>} handlers keyed by table
 *   name; a `'*'` key receives every change.
 * @returns {() => void} unsubscribe
 */
function connect(path, handlers) {
  const source = new EventSource(path, { withCredentials: true })

  source.addEventListener('change', (event) => {
    let change
    try { change = JSON.parse(event.data) } catch { return }
    handlers[change.table]?.(change)
    handlers['*']?.(change)
  })

  // EventSource reconnects on its own; nothing to do but stay quiet about it.
  source.onerror = () => {}

  return () => source.close()
}

/** Changes to any game the signed-in user can see. Drives the games list. */
export const subscribeToGames = (handlers) => connect('/api/realtime/games', handlers)

/** Changes within a single game: teams, rounds, logs, members, the game row. */
export const subscribeToGame = (gameId, handlers) =>
  connect(`/api/realtime/games/${encodeURIComponent(gameId)}`, handlers)

/** Scoreboard changes behind a public share token. No account needed. */
export const subscribeToPublicGame = (token, handlers) =>
  connect(`/api/realtime/public/${encodeURIComponent(token)}`, handlers)
