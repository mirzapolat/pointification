// Thin client for the app's own JSON API.
//
// Every call resolves to `{ data, error }` — never throws — so page code can
// keep doing `const { data, error } = await …` and branch on `error.message`.
// Auth rides on an httpOnly session cookie, so requests just need credentials.

const BASE = '/api'

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body, headers } = {}) {
  const init = { method, credentials: 'same-origin', headers: { ...headers } }

  if (body instanceof Blob) {
    init.body = body
    init.headers['content-type'] = body.type || 'application/octet-stream'
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers['content-type'] = 'application/json'
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, init)
  } catch {
    return { data: null, error: new ApiError('Could not reach the server.', 0) }
  }

  const payload = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const message = payload?.error ?? `Request failed (${res.status}).`
    return { data: null, error: new ApiError(message, res.status) }
  }
  return { data: payload, error: null }
}

const unwrap = (key) => (result) =>
  result.error ? result : { data: result.data?.[key] ?? null, error: null }

const pick = async (promise, key) => unwrap(key)(await promise)

// --- Auth ----------------------------------------------------------------

export const getSession = () => request('/auth/session')

export const signUp = (email, password, displayName) =>
  request('/auth/signup', { method: 'POST', body: { email, password, display_name: displayName } })

export const signIn = (email, password) =>
  request('/auth/login', { method: 'POST', body: { email, password } })

export const verifySignupCode = (email, code) =>
  request('/auth/verify', { method: 'POST', body: { email, code } })

export const resendSignupCode = (email) =>
  request('/auth/resend', { method: 'POST', body: { email } })

export const verifyMfaCode = (code) =>
  request('/auth/mfa', { method: 'POST', body: { code } })

export const signOut = () => request('/auth/logout', { method: 'POST' })

// --- Account -------------------------------------------------------------

export const updateAccount = (patch) => request('/account', { method: 'PATCH', body: patch })

export const changeEmail = (email) =>
  request('/account/email', { method: 'POST', body: { email } })

export const changePassword = (currentPassword, newPassword) =>
  request('/account/password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  })

export const getMfaStatus = () => request('/account/mfa')
export const enrollMfa = () => request('/account/mfa/enroll', { method: 'POST' })
export const enableMfa = (code) => request('/account/mfa/enable', { method: 'POST', body: { code } })
export const disableMfa = (code) => request('/account/mfa/disable', { method: 'POST', body: { code } })
export const cancelMfaEnrollment = () => request('/account/mfa/cancel', { method: 'POST' })

export const getUserDetails = () => pick(request('/account/details'), 'details')

export const saveUserDetails = (patch) =>
  pick(request('/account/details', { method: 'PATCH', body: patch }), 'details')

export const deleteAccount = () => request('/account', { method: 'DELETE' })

// --- Games ---------------------------------------------------------------

export const listGames = () => pick(request('/games'), 'games')
export const getGame = (id) => pick(request(`/games/${id}`), 'game')

export const createGame = (name) =>
  pick(request('/games', { method: 'POST', body: { name } }), 'game')

export const updateGame = (id, patch) =>
  pick(request(`/games/${id}`, { method: 'PATCH', body: patch }), 'game')

export const deleteGame = (id) => request(`/games/${id}`, { method: 'DELETE' })

export const setGameSharing = (id, enabled) =>
  pick(request(`/games/${id}/sharing`, { method: 'POST', body: { enabled } }), 'game')

export const rotateGameToken = (id) =>
  pick(request(`/games/${id}/rotate-token`, { method: 'POST' }), 'game')

export const uploadGameLogo = (id, file) =>
  pick(request(`/games/${id}/logo`, { method: 'PUT', body: file }), 'game')

export const removeGameLogo = (id) =>
  pick(request(`/games/${id}/logo`, { method: 'DELETE' }), 'game')

// --- Teams ---------------------------------------------------------------

export const listTeams = (gameId) => pick(request(`/games/${gameId}/teams`), 'teams')

export const createTeams = (gameId, teams) =>
  pick(request(`/games/${gameId}/teams`, { method: 'POST', body: { teams } }), 'teams')

export const createTeam = async (gameId, team) => {
  const { data, error } = await createTeams(gameId, [team])
  return error ? { data: null, error } : { data: data?.[0] ?? null, error: null }
}

export const updateTeam = (id, patch) =>
  pick(request(`/teams/${id}`, { method: 'PATCH', body: patch }), 'team')

export const deleteTeam = (id) => request(`/teams/${id}`, { method: 'DELETE' })

export const applyPointChange = (teamId, delta) =>
  request(`/teams/${teamId}/points`, { method: 'POST', body: { delta } })

// --- Rounds --------------------------------------------------------------

export const listRounds = (gameId) => pick(request(`/games/${gameId}/rounds`), 'rounds')

export const createRounds = (gameId, rounds) =>
  pick(request(`/games/${gameId}/rounds`, { method: 'POST', body: { rounds } }), 'rounds')

export const createRound = async (gameId, round) => {
  const { data, error } = await createRounds(gameId, [round])
  return error ? { data: null, error } : { data: data?.[0] ?? null, error: null }
}

export const updateRound = (id, patch) =>
  pick(request(`/rounds/${id}`, { method: 'PATCH', body: patch }), 'round')

export const deleteRound = (id) => request(`/rounds/${id}`, { method: 'DELETE' })

// --- Point logs ----------------------------------------------------------

export const listLogs = (gameId, roundId) =>
  pick(request(`/games/${gameId}/logs${roundId ? `?round_id=${encodeURIComponent(roundId)}` : ''}`), 'logs')

export const undoLastPointChange = (gameId) => request(`/games/${gameId}/undo`, { method: 'POST' })

// --- Collaborators -------------------------------------------------------

export const listMembers = (gameId) => pick(request(`/games/${gameId}/members`), 'members')

export const inviteMember = (gameId, email) =>
  request(`/games/${gameId}/members`, { method: 'POST', body: { email } })

export const removeMember = (gameId, userId) =>
  request(`/games/${gameId}/members/${userId}`, { method: 'DELETE' })

// --- Public share links --------------------------------------------------

export const getPublicGame = (token) => request(`/public/${encodeURIComponent(token)}`)

// --- Uploaded files ------------------------------------------------------

/** Turns a stored logo_path into a URL the browser can load. */
export function logoUrl(path) {
  if (!path) return null
  return `/logos/${String(path).split('/').map(encodeURIComponent).join('/')}`
}
