// WebAuthn passkeys: registration, passwordless sign-in, and the passkey
// flavour of the 2FA step-up. The crypto/CBOR work is SimpleWebAuthn's; this
// module owns challenge storage and the passkeys table.
import crypto from 'node:crypto'
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { all, get, run, nowIso } from '../db.js'
import { badRequest, unauthorized } from './http.js'

const RP_NAME = 'Pointification'
const CHALLENGE_COOKIE = 'pf_webauthn'
const CHALLENGE_TTL_MS = 5 * 60_000
const MAX_NAME = 60

/**
 * The relying party is the site's own origin. APP_URL pins it in production;
 * otherwise it follows the request (Vite's dev proxy keeps the browser's Host).
 */
function relyingParty(req) {
  let origin
  if (process.env.APP_URL) {
    origin = new URL(process.env.APP_URL).origin
  } else {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim()
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
    origin = `${proto}://${host}`
  }
  return { origin, rpID: new URL(origin).hostname }
}

const parseTransports = (json) => {
  try { return JSON.parse(json ?? '[]') } catch { return [] }
}

// --- Challenges ----------------------------------------------------------

function storeChallenge(res, { purpose, userId = null, challenge }) {
  const id = crypto.randomBytes(24).toString('base64url')
  run(
    `INSERT INTO webauthn_challenges (id, user_id, purpose, challenge, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    id, userId, purpose, challenge, new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()
  )
  res.cookie(CHALLENGE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
    maxAge: CHALLENGE_TTL_MS,
  })
}

/** Single use: the row is deleted whether or not it matches. */
function takeChallenge(req, res, purpose, userId = null) {
  const id = req.cookies?.[CHALLENGE_COOKIE]
  res.clearCookie(CHALLENGE_COOKIE, { path: '/api' })
  if (!id) return null
  const row = get('SELECT * FROM webauthn_challenges WHERE id = ?', id)
  run('DELETE FROM webauthn_challenges WHERE id = ?', id)
  if (!row || row.purpose !== purpose) return null
  if (new Date(row.expires_at) < new Date()) return null
  if (userId && row.user_id !== userId) return null
  return row.challenge
}

export function pruneChallenges() {
  run('DELETE FROM webauthn_challenges WHERE expires_at < ?', nowIso())
}

// --- Stored passkeys -----------------------------------------------------

export const listPasskeys = (userId) =>
  all(
    `SELECT id, name, created_at, last_used_at FROM passkeys
      WHERE user_id = ? ORDER BY created_at`,
    userId
  )

export const hasPasskey = (userId) =>
  !!get('SELECT 1 AS ok FROM passkeys WHERE user_id = ? LIMIT 1', userId)

export function deletePasskey(userId, id) {
  return run('DELETE FROM passkeys WHERE id = ? AND user_id = ?', id, userId).changes > 0
}

// --- Registration --------------------------------------------------------

export async function registrationOptions(req, res, user) {
  const { rpID } = relyingParty(req)
  const existing = all('SELECT id, transports FROM passkeys WHERE user_id = ?', user.id)
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email,
    userDisplayName: user.display_name || user.email,
    // Stable per user, so re-registering on the same authenticator replaces
    // the old credential instead of piling up duplicates.
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map(c => ({ id: c.id, transports: parseTransports(c.transports) })),
    // Discoverable + user-verified, so the passkey works for passwordless sign-in.
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })
  storeChallenge(res, { purpose: 'register', userId: user.id, challenge: options.challenge })
  return options
}

export async function registerPasskey(req, res, user, response, name) {
  const challenge = takeChallenge(req, res, 'register', user.id)
  if (!challenge) throw badRequest('That request expired. Try again.')
  const { origin, rpID } = relyingParty(req)

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
  } catch {
    throw badRequest('Could not verify that passkey.')
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw badRequest('Could not verify that passkey.')
  }

  const { credential } = verification.registrationInfo
  if (get('SELECT 1 AS ok FROM passkeys WHERE id = ?', credential.id)) {
    throw badRequest('That passkey is already registered.')
  }
  const label = String(name ?? '').trim().slice(0, MAX_NAME) || 'Passkey'
  run(
    `INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    credential.id,
    user.id,
    isoBase64URL.fromBuffer(credential.publicKey),
    credential.counter,
    JSON.stringify(credential.transports ?? response?.response?.transports ?? []),
    label,
    nowIso()
  )
  return get('SELECT id, name, created_at, last_used_at FROM passkeys WHERE id = ?', credential.id)
}

// --- Authentication ------------------------------------------------------

/**
 * `user` set = 2FA step-up for that account (purpose 'mfa');
 * no user = passwordless sign-in with a discoverable credential ('login').
 */
export async function authenticationOptions(req, res, user = null) {
  const { rpID } = relyingParty(req)
  const allowCredentials = user
    ? all('SELECT id, transports FROM passkeys WHERE user_id = ?', user.id)
        .map(c => ({ id: c.id, transports: parseTransports(c.transports) }))
    : undefined
  if (user && !allowCredentials.length) throw badRequest('No passkeys on this account.')
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: 'required',
  })
  storeChallenge(res, {
    purpose: user ? 'mfa' : 'login',
    userId: user?.id ?? null,
    challenge: options.challenge,
  })
  return options
}

/** Verifies an assertion and returns the user id it proves. */
export async function verifyPasskey(req, res, response, user = null) {
  const challenge = takeChallenge(req, res, user ? 'mfa' : 'login', user?.id ?? null)
  if (!challenge) throw badRequest('That request expired. Try again.')

  const stored = get('SELECT * FROM passkeys WHERE id = ?', String(response?.id ?? ''))
  if (!stored || (user && stored.user_id !== user.id)) {
    throw unauthorized('That passkey is not registered here.')
  }

  const { origin, rpID } = relyingParty(req)
  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.id,
        publicKey: isoBase64URL.toBuffer(stored.public_key),
        counter: stored.counter,
        transports: parseTransports(stored.transports),
      },
    })
  } catch {
    throw unauthorized('Could not verify that passkey.')
  }
  if (!verification.verified) throw unauthorized('Could not verify that passkey.')

  run('UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?',
    verification.authenticationInfo.newCounter, nowIso(), stored.id)
  return stored.user_id
}
