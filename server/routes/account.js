// Profile, email, password, two-factor and account deletion.
import express from 'express'
import { get, run, tx, nowIso } from '../db.js'
import { serializeUser, serializeDetails } from '../lib/serialize.js'
import { badRequest, wrap } from '../lib/http.js'
import { generateSecret, otpauthUri, verifyTotp } from '../lib/totp.js'
import { hashPassword, verifyPassword, requireAuth, destroyUserSessions, clearSessionCookie } from '../lib/auth.js'
import { deleteLogoDir } from '../lib/logos.js'
import { listPasskeys, registrationOptions, registerPasskey, deletePasskey } from '../lib/passkeys.js'
import { notFound } from '../lib/http.js'
import { vapidPublicKey, isAllowedPushEndpoint } from '../lib/push.js'
import crypto from 'node:crypto'

const router = express.Router()
router.use(requireAuth)

const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase()
const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

const touch = (id) => run('UPDATE users SET updated_at = ? WHERE id = ?', nowIso(), id)

// PATCH /api/account — display name, invite and notification preferences.
router.patch('/', wrap(async (req, res) => {
  const { display_name, allow_invites, notify_points } = req.body ?? {}
  if (display_name !== undefined) {
    const next = String(display_name ?? '').trim()
    if (!next) throw badRequest("Name can't be empty.")
    if (next.length > 60) throw badRequest('Name must be 60 characters or fewer.')
    run('UPDATE users SET display_name = ? WHERE id = ?', next, req.user.id)
  }
  if (allow_invites !== undefined) {
    run('UPDATE users SET allow_invites = ? WHERE id = ?', allow_invites ? 1 : 0, req.user.id)
  }
  if (notify_points !== undefined) {
    run('UPDATE users SET notify_points = ? WHERE id = ?', notify_points ? 1 : 0, req.user.id)
  }
  touch(req.user.id)
  res.json({ user: serializeUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) })
}))

// --- Push notifications ----------------------------------------------------

// GET /api/account/push — the server's VAPID key, for pushManager.subscribe().
router.get('/push', (req, res) => {
  res.json({ public_key: vapidPublicKey, notify_points: req.user.notify_points === 1 })
})

// POST /api/account/push { subscription } — register this device.
router.post('/push', wrap(async (req, res) => {
  const sub = req.body?.subscription
  const endpoint = String(sub?.endpoint ?? '')
  const p256dh = String(sub?.keys?.p256dh ?? '')
  const auth = String(sub?.keys?.auth ?? '')
  if (!isAllowedPushEndpoint(endpoint) || !p256dh || !auth) throw badRequest('Invalid push subscription.')
  if (endpoint.length > 1024 || p256dh.length > 256 || auth.length > 64) throw badRequest('Invalid push subscription.')
  // An endpoint belongs to one browser; re-point it if another account had it.
  run(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    crypto.randomUUID(), req.user.id, endpoint, p256dh, auth, nowIso())
  res.status(201).json({ ok: true })
}))

// POST /api/account/push/remove { endpoint } — forget this device.
router.post('/push/remove', wrap(async (req, res) => {
  run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?',
    String(req.body?.endpoint ?? ''), req.user.id)
  res.json({ ok: true })
}))

// POST /api/account/email
router.post('/email', wrap(async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  if (!looksLikeEmail(email)) throw badRequest('Enter a valid email address.')
  if (get('SELECT 1 AS ok FROM users WHERE email_lower = ? AND id <> ?', email, req.user.id)) {
    throw badRequest('That email is already in use.')
  }
  run(
    'UPDATE users SET email = ?, email_lower = ?, email_confirmed_at = COALESCE(email_confirmed_at, ?), updated_at = ? WHERE id = ?',
    email, email, nowIso(), nowIso(), req.user.id
  )
  res.json({ user: serializeUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) })
}))

// POST /api/account/password
router.post('/password', wrap(async (req, res) => {
  const current = String(req.body?.current_password ?? '')
  const next = String(req.body?.new_password ?? '')
  if (!verifyPassword(current, req.user.password_hash)) {
    throw badRequest('Current password is incorrect.')
  }
  if (next.length < 6) throw badRequest('New password must be at least 6 characters.')
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
    hashPassword(next), nowIso(), req.user.id)
  res.json({ ok: true })
}))

// --- Two-factor ----------------------------------------------------------

// GET /api/account/mfa — current state, plus any half-finished enrolment.
router.get('/mfa', wrap(async (req, res) => {
  res.json({
    enabled: !!req.user.totp_confirmed_at,
    pending: !!req.user.totp_secret && !req.user.totp_confirmed_at,
  })
}))

// POST /api/account/mfa/enroll — mint a secret; not active until confirmed.
router.post('/mfa/enroll', wrap(async (req, res) => {
  if (req.user.totp_confirmed_at) throw badRequest('Two-factor is already on.')
  const secret = generateSecret()
  run('UPDATE users SET totp_secret = ?, updated_at = ? WHERE id = ?', secret, nowIso(), req.user.id)
  res.json({ secret, uri: otpauthUri({ secret, account: req.user.email }) })
}))

// POST /api/account/mfa/enable — confirm the enrolment with a live code.
router.post('/mfa/enable', wrap(async (req, res) => {
  if (req.user.totp_confirmed_at) throw badRequest('Two-factor is already on.')
  if (!req.user.totp_secret) throw badRequest('Start the setup again.')
  if (!verifyTotp(req.user.totp_secret, req.body?.code)) throw badRequest('That code is not right.')
  run('UPDATE users SET totp_confirmed_at = ?, updated_at = ? WHERE id = ?',
    nowIso(), nowIso(), req.user.id)
  // The current session already proved the factor, so keep it at aal2.
  run('UPDATE sessions SET aal = ? WHERE id = ?', 'aal2', req.session.id)
  res.json({ enabled: true })
}))

// POST /api/account/mfa/disable
router.post('/mfa/disable', wrap(async (req, res) => {
  if (!req.user.totp_confirmed_at) throw badRequest('Two-factor is not on.')
  if (!verifyTotp(req.user.totp_secret, req.body?.code)) throw badRequest('That code is not right.')
  run('UPDATE users SET totp_secret = NULL, totp_confirmed_at = NULL, updated_at = ? WHERE id = ?',
    nowIso(), req.user.id)
  res.json({ enabled: false })
}))

// POST /api/account/mfa/cancel — drop an enrolment the user backed out of.
router.post('/mfa/cancel', wrap(async (req, res) => {
  if (!req.user.totp_confirmed_at) {
    run('UPDATE users SET totp_secret = NULL WHERE id = ?', req.user.id)
  }
  res.json({ ok: true })
}))

// --- Passkeys ------------------------------------------------------------

// GET /api/account/passkeys
router.get('/passkeys', wrap(async (req, res) => {
  res.json({ passkeys: listPasskeys(req.user.id) })
}))

// POST /api/account/passkeys/options — begin registering a new passkey.
router.post('/passkeys/options', wrap(async (req, res) => {
  res.json(await registrationOptions(req, res, req.user))
}))

// POST /api/account/passkeys — finish registration. The current session has
// already cleared any 2FA (requireAuth), so it stays at aal2.
router.post('/passkeys', wrap(async (req, res) => {
  const passkey = await registerPasskey(req, res, req.user, req.body?.response, req.body?.name)
  res.status(201).json({ passkey })
}))

// DELETE /api/account/passkeys/:id
router.delete('/passkeys/:id', wrap(async (req, res) => {
  if (!deletePasskey(req.user.id, req.params.id)) throw notFound('Passkey not found.')
  res.json({ ok: true })
}))

// --- Onboarding details --------------------------------------------------

router.get('/details', wrap(async (req, res) => {
  res.json({ details: serializeDetails(get('SELECT * FROM user_details WHERE user_id = ?', req.user.id)) })
}))

// PATCH /api/account/details — upsert; only the keys sent are touched.
router.patch('/details', wrap(async (req, res) => {
  const fields = ['organization', 'role', 'intended_use', 'details_completed_at', 'onboarding_completed_at']
  const body = req.body ?? {}
  const ts = nowIso()
  run(
    'INSERT INTO user_details (user_id, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING',
    req.user.id, ts, ts
  )
  for (const key of fields) {
    if (!(key in body)) continue
    const value = body[key] === '' ? null : body[key] ?? null
    run(`UPDATE user_details SET ${key} = ?, updated_at = ? WHERE user_id = ?`, value, ts, req.user.id)
  }
  res.json({ details: serializeDetails(get('SELECT * FROM user_details WHERE user_id = ?', req.user.id)) })
}))

// DELETE /api/account — cascades to owned games, teams, logs and memberships.
router.delete('/', wrap(async (req, res) => {
  const userId = req.user.id
  tx(() => {
    destroyUserSessions(userId)
    run('DELETE FROM users WHERE id = ?', userId)
  })
  deleteLogoDir(userId)
  clearSessionCookie(res)
  res.json({ ok: true })
}))

export default router
