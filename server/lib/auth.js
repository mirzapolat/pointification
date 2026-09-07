// Password hashing, session tokens, and the request-authentication middleware.
import crypto from 'node:crypto'
import { db, get, run, nowIso } from '../db.js'
import { unauthorized, forbidden } from './http.js'

const SESSION_COOKIE = 'pf_session'
const SESSION_DAYS = 30
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 }

// --- Passwords -----------------------------------------------------------

export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS)
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = String(stored).split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(keyB64, 'base64')
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    })
    return crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

// --- Sessions ------------------------------------------------------------

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

export function createSession(userId, aal = 'aal1') {
  const token = crypto.randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000)
  run(
    `INSERT INTO sessions (id, user_id, token_hash, aal, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(), userId, hashToken(token), aal, nowIso(), expires.toISOString()
  )
  return { token, expires }
}

export function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', hashToken(token))
}

export function destroyUserSessions(userId) {
  run('DELETE FROM sessions WHERE user_id = ?', userId)
}

export function upgradeSession(token, aal) {
  if (token) run('UPDATE sessions SET aal = ? WHERE token_hash = ?', aal, hashToken(token))
}

export function setSessionCookie(res, token, expires) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  })
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

export const readSessionCookie = (req) => req.cookies?.[SESSION_COOKIE] ?? null

/** Deletes expired rows now and then so the table doesn't grow forever. */
export function pruneSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', nowIso())
  run('DELETE FROM email_codes WHERE expires_at < ?', nowIso())
}

// --- Middleware ----------------------------------------------------------

/**
 * Populates req.user / req.session when a valid cookie is present.
 * Never rejects — `requireAuth` does that, so public routes can stay open.
 */
export function attachUser(req, _res, next) {
  req.user = null
  req.session = null
  const token = readSessionCookie(req)
  if (!token) return next()
  const row = get(
    `SELECT s.id AS session_id, s.aal, s.expires_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    hashToken(token)
  )
  if (!row) return next()
  if (new Date(row.expires_at) < new Date()) {
    run('DELETE FROM sessions WHERE id = ?', row.session_id)
    return next()
  }
  req.sessionToken = token
  req.session = { id: row.session_id, aal: row.aal }
  req.user = row
  next()
}

/** Requires a signed-in user who has cleared 2FA if their account has it on. */
export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized())
  if (req.user.totp_confirmed_at && req.session.aal !== 'aal2') {
    return next(forbidden('Two-factor verification required.'))
  }
  next()
}

/** Like requireAuth but tolerates aal1 — used by the MFA step-up endpoints. */
export function requireSession(req, _res, next) {
  if (!req.user) return next(unauthorized())
  next()
}

/** Owner or invited collaborator — the SQLite equivalent of has_game_access(). */
export function hasGameAccess(gameId, userId) {
  if (!userId) return false
  const row = db.prepare(
    `SELECT 1 FROM games WHERE id = ? AND user_id = ?
     UNION ALL
     SELECT 1 FROM game_members WHERE game_id = ? AND user_id = ?`
  ).get(gameId, userId, gameId, userId)
  return !!row
}

export function isGameOwner(gameId, userId) {
  return !!get('SELECT 1 AS ok FROM games WHERE id = ? AND user_id = ?', gameId, userId)
}
