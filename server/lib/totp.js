// RFC 6238 TOTP (SHA-1, 6 digits, 30s step) — the algorithm every authenticator
// app implements. Small enough to own rather than take a dependency for.
import crypto from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP = 30
const DIGITS = 6

export function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes))
}

export function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

function codeAt(secret, counter) {
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0')
}

/** Verifies a code, allowing one step of clock drift either way. */
export function verifyTotp(secret, code, window = 1) {
  const clean = String(code ?? '').replace(/\D/g, '')
  if (clean.length !== DIGITS || !secret) return false
  const counter = Math.floor(Date.now() / 1000 / STEP)
  for (let i = -window; i <= window; i++) {
    const expected = codeAt(secret, counter + i)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true
  }
  return false
}

export function otpauthUri({ secret, account, issuer = 'Pointification' }) {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP),
  })
  return `otpauth://totp/${label}?${params}`
}
