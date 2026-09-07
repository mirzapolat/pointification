// Sign-up, email verification, sign-in, and the 2FA step-up at login.
import crypto from 'node:crypto'
import express from 'express'
import { get, run, tx, nowIso } from '../db.js'
import { serializeUser, serializeDetails } from '../lib/serialize.js'
import { badRequest, unauthorized, wrap } from '../lib/http.js'
import { mailEnabled, sendVerificationCode } from '../lib/mail.js'
import { verifyTotp } from '../lib/totp.js'
import {
  hashPassword, verifyPassword, createSession, destroySession, upgradeSession,
  setSessionCookie, clearSessionCookie, requireSession,
} from '../lib/auth.js'

const router = express.Router()

const CODE_TTL_MIN = 15
const MAX_CODE_ATTEMPTS = 8

const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase()
const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const hashCode = (code) => crypto.createHash('sha256').update(code).digest('hex')

function issueCode(userId, email) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  run(
    `INSERT INTO email_codes (user_id, code_hash, attempts, expires_at, created_at)
     VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       code_hash = excluded.code_hash, attempts = 0,
       expires_at = excluded.expires_at, created_at = excluded.created_at`,
    userId, hashCode(code), new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(), nowIso()
  )
  // Fire-and-forget: a mail outage must not block the signup response.
  sendVerificationCode(email, code).catch(err => console.error('[mail]', err))
  return code
}

/** Signs the user in and returns the payload the client's auth context expects. */
function startSession(res, user) {
  const aal = user.totp_confirmed_at ? 'aal1' : 'aal2'
  const { token, expires } = createSession(user.id, aal)
  setSessionCookie(res, token, expires)
  return {
    user: serializeUser(user),
    mfa_required: !!user.totp_confirmed_at,
  }
}

function sessionPayload(req) {
  if (!req.user) return { user: null, mfa_required: false, details: null }
  const mfaRequired = !!req.user.totp_confirmed_at && req.session.aal !== 'aal2'
  return {
    user: serializeUser(req.user),
    mfa_required: mfaRequired,
    details: mfaRequired
      ? null
      : serializeDetails(get('SELECT * FROM user_details WHERE user_id = ?', req.user.id)),
  }
}

// GET /api/auth/session — who am I? Drives the whole client auth context.
router.get('/session', (req, res) => res.json(sessionPayload(req)))

// POST /api/auth/signup
router.post('/signup', wrap(async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password ?? '')
  const displayName = String(req.body?.display_name ?? '').trim() || null

  if (!looksLikeEmail(email)) throw badRequest('Enter a valid email address.')
  if (password.length < 6) throw badRequest('Password must be at least 6 characters.')
  if (get('SELECT 1 AS ok FROM users WHERE email_lower = ?', email)) {
    throw badRequest('An account with that email already exists.')
  }

  const id = crypto.randomUUID()
  const ts = nowIso()
  // With no mail transport configured the account is usable immediately;
  // otherwise it stays unconfirmed until the emailed code is entered.
  const confirmedAt = mailEnabled ? null : ts

  tx(() => {
    run(
      `INSERT INTO users (id, email, email_lower, password_hash, display_name,
                          email_confirmed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, email, email, hashPassword(password), displayName, confirmedAt, ts, ts
    )
    run(
      'INSERT INTO user_details (user_id, created_at, updated_at) VALUES (?, ?, ?)',
      id, ts, ts
    )
  })

  const user = get('SELECT * FROM users WHERE id = ?', id)
  if (mailEnabled) {
    issueCode(id, email)
    res.status(201).json({ user: serializeUser(user), verification_required: true })
    return
  }
  res.status(201).json({ ...startSession(res, user), verification_required: false })
}))

// POST /api/auth/verify — exchange the emailed code for a session.
router.post('/verify', wrap(async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const code = String(req.body?.code ?? '').replace(/\D/g, '')
  const user = get('SELECT * FROM users WHERE email_lower = ?', email)
  if (!user) throw badRequest('No account for that email.')
  if (user.email_confirmed_at) {
    throw badRequest('That email is already verified — sign in instead.')
  }

  const pending = get('SELECT * FROM email_codes WHERE user_id = ?', user.id)
  if (!pending) throw badRequest('That code has expired. Request a new one.')
  if (new Date(pending.expires_at) < new Date()) {
    run('DELETE FROM email_codes WHERE user_id = ?', user.id)
    throw badRequest('That code has expired. Request a new one.')
  }
  if (pending.attempts >= MAX_CODE_ATTEMPTS) {
    throw badRequest('Too many attempts. Request a new code.')
  }
  if (hashCode(code) !== pending.code_hash) {
    run('UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ?', user.id)
    throw badRequest('That code is not right.')
  }

  const ts = nowIso()
  tx(() => {
    run('UPDATE users SET email_confirmed_at = ?, updated_at = ? WHERE id = ?', ts, ts, user.id)
    run('DELETE FROM email_codes WHERE user_id = ?', user.id)
  })
  res.json(startSession(res, get('SELECT * FROM users WHERE id = ?', user.id)))
}))

// POST /api/auth/resend
router.post('/resend', wrap(async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const user = get('SELECT * FROM users WHERE email_lower = ?', email)
  // Don't leak whether the address exists.
  if (user && !user.email_confirmed_at && mailEnabled) issueCode(user.id, user.email)
  res.json({ ok: true })
}))

// POST /api/auth/login
router.post('/login', wrap(async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password ?? '')
  const user = get('SELECT * FROM users WHERE email_lower = ?', email)
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw unauthorized('Wrong email or password.')
  }
  if (!user.email_confirmed_at) {
    throw unauthorized('Verify your email before signing in.')
  }
  res.json(startSession(res, user))
}))

// POST /api/auth/mfa — second factor at sign-in, upgrading the session to aal2.
router.post('/mfa', requireSession, wrap(async (req, res) => {
  const user = req.user
  if (!user.totp_confirmed_at) throw badRequest('Two-factor is not enabled.')
  if (!verifyTotp(user.totp_secret, req.body?.code)) {
    throw unauthorized('That code is not right.')
  }
  upgradeSession(req.sessionToken, 'aal2')
  req.session.aal = 'aal2'
  res.json(sessionPayload(req))
}))

// POST /api/auth/logout
router.post('/logout', wrap(async (req, res) => {
  destroySession(req.sessionToken)
  clearSessionCookie(res)
  res.json({ ok: true })
}))

export default router