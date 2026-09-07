// Game logos on the local filesystem. Files live at
// <LOGO_DIR>/<user_id>/<game_id>/<file> and are served read-only from /logos,
// keeping the old `{user_id}/{game_id}/{name}` logo_path convention intact.
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const LOGO_DIR = process.env.LOGO_DIR
  ? path.resolve(process.env.LOGO_DIR)
  : path.resolve(__dirname, '../../data/logos')

mkdirSync(LOGO_DIR, { recursive: true })

const EXT_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
}

export const allowedTypes = () => Object.keys(EXT_BY_TYPE)

/** Rejects anything that would escape the logo directory. */
function resolveWithin(relPath) {
  const full = path.resolve(LOGO_DIR, relPath)
  if (full !== LOGO_DIR && !full.startsWith(LOGO_DIR + path.sep)) return null
  return full
}

export function saveLogo({ userId, gameId, buffer, contentType }) {
  const ext = EXT_BY_TYPE[contentType]
  if (!ext) return null
  const name = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`
  const rel = path.posix.join(userId, gameId, name)
  const full = resolveWithin(rel)
  if (!full) return null
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, buffer)
  return rel
}

export function deleteLogo(relPath) {
  if (!relPath) return
  const full = resolveWithin(relPath)
  if (full && existsSync(full)) rmSync(full, { force: true })
}

/** Removes a whole game's (or user's) logo folder. */
export function deleteLogoDir(relDir) {
  if (!relDir) return
  const full = resolveWithin(relDir)
  if (full && full !== LOGO_DIR && existsSync(full)) rmSync(full, { recursive: true, force: true })
}
