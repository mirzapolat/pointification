// Game export/import: a self-contained JSON file for backups and for moving
// games between accounts. Imports always create new games owned by the
// importer; nothing is ever overwritten.
//
// Left out on purpose, because they belong to accounts or URLs rather than to
// the game: collaborators, public share links, notification preferences.
// Score history keeps who scored only as "me" (the exporter), which the
// import maps to the importing account; everyone else's entries become
// unattributed.
import crypto from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { all, run, tx, nowIso } from '../db.js'
import { badRequest } from './http.js'
import { LOGO_DIR, saveLogo, allowedTypes } from './logos.js'

export const EXPORT_FORMAT = 'pointification-games'
export const EXPORT_VERSION = 1

const LIMITS = { games: 500, teams: 500, rounds: 1000, logs: 200_000, name: 200, logoBytes: 4 * 1024 * 1024 }

const TYPE_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' }

function readLogo(relPath) {
  if (!relPath) return null
  const full = path.resolve(LOGO_DIR, relPath)
  if (!full.startsWith(LOGO_DIR + path.sep) || !existsSync(full)) return null
  const type = TYPE_BY_EXT[path.extname(full).slice(1).toLowerCase()]
  if (!type) return null
  return { type, data: readFileSync(full).toString('base64') }
}

/** One game row as a portable object. `exporterId` marks the exporter's own history entries. */
export function exportGame(game, exporterId) {
  const teams = all('SELECT * FROM teams WHERE game_id = ? ORDER BY position, created_at', game.id)
  const rounds = all('SELECT * FROM rounds WHERE game_id = ? ORDER BY position, created_at', game.id)
  const logs = all('SELECT * FROM point_logs WHERE game_id = ? ORDER BY created_at, id', game.id)
  const teamRef = new Map(teams.map((t, i) => [t.id, `t${i + 1}`]))
  const roundRef = new Map(rounds.map((r, i) => [r.id, `r${i + 1}`]))
  let presets
  try { presets = JSON.parse(game.point_presets) } catch { presets = [] }

  return {
    name: game.name,
    created_at: game.created_at,
    archived: !!game.archived_at,
    settings: {
      allow_negative: game.allow_negative === 1,
      rounds_enabled: game.rounds_enabled === 1,
      current_round: roundRef.get(game.current_round_id) ?? null,
      point_presets: presets,
      team_sort: game.team_sort,
      cover_color: game.cover_color ?? null,
      logo_placement: game.logo_placement ?? null,
      logo_shape: game.logo_shape,
      logo_scale: game.logo_scale,
    },
    logo: readLogo(game.logo_path),
    teams: teams.map(t => ({
      ref: teamRef.get(t.id), name: t.name, color: t.color, score: t.score, position: t.position, created_at: t.created_at,
    })),
    rounds: rounds.map(r => ({
      ref: roundRef.get(r.id), name: r.name, position: r.position, created_at: r.created_at,
    })),
    logs: logs.filter(l => teamRef.has(l.team_id)).map(l => ({
      team: teamRef.get(l.team_id),
      round: roundRef.get(l.round_id) ?? null,
      delta: l.delta,
      new_score: l.new_score,
      created_at: l.created_at,
      by_me: !!exporterId && l.user_id === exporterId,
      undone_at: l.undone_at ?? null,
      undone_by_me: !!exporterId && !!l.undone_at && l.undone_by === exporterId,
    })),
  }
}

export function exportFile(games, exporterId) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: nowIso(),
    games: games.map(g => exportGame(g, exporterId)),
  }
}

/** Owned games for "export all": archived ones included, trashed ones not. */
export const ownedGamesForExport = (userId) =>
  all('SELECT * FROM games WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at', userId)

// --- Import validation ---------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const int = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : fallback)
const text = (v, fallback = '') => (typeof v === 'string' ? v.trim().slice(0, LIMITS.name) : fallback)
const hex = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null)
const iso = (v, fallback) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback)
const oneOf = (v, options, fallback) => (options.includes(v) ? v : fallback)
const list = (v, max, label) => {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw badRequest(`${label} must be a list.`)
  if (v.length > max) throw badRequest(`Too many ${label.toLowerCase()} (at most ${max}).`)
  return v
}

/** Checks the whole file up front, so an import either fully succeeds or changes nothing. */
function parseFile(file) {
  if (!isObj(file) || file.format !== EXPORT_FORMAT) {
    throw badRequest('This is not a Pointification export file.')
  }
  if (int(file.version, 0) > EXPORT_VERSION) {
    throw badRequest('This file was made by a newer version of Pointification.')
  }
  const games = list(file.games, LIMITS.games, 'Games')
  if (!games.length) throw badRequest('The file contains no games.')

  const now = nowIso()
  return games.map((g, gi) => {
    if (!isObj(g)) throw badRequest(`Game ${gi + 1} is malformed.`)
    const name = text(g.name)
    if (!name) throw badRequest(`Game ${gi + 1} has no name.`)
    const s = isObj(g.settings) ? g.settings : {}

    const teams = list(g.teams, LIMITS.teams, 'Teams').map((t, i) => {
      if (!isObj(t)) throw badRequest(`A team in "${name}" is malformed.`)
      return {
        ref: String(t.ref ?? `#${i}`),
        name: text(t.name) || `Team ${i + 1}`,
        color: hex(t.color) ?? '#FFD93D',
        score: int(t.score),
        position: int(t.position, i),
        created_at: iso(t.created_at, now),
      }
    })
    const rounds = list(g.rounds, LIMITS.rounds, 'Rounds').map((r, i) => {
      if (!isObj(r)) throw badRequest(`A round in "${name}" is malformed.`)
      return {
        ref: String(r.ref ?? `#${i}`),
        name: text(r.name) || `Round ${i + 1}`,
        position: int(r.position, i),
        created_at: iso(r.created_at, now),
      }
    })
    const teamRefs = new Set(teams.map(t => t.ref))
    const roundRefs = new Set(rounds.map(r => r.ref))
    if (teamRefs.size !== teams.length || roundRefs.size !== rounds.length) {
      throw badRequest(`"${name}" has duplicate team or round references.`)
    }

    const logs = list(g.logs, LIMITS.logs, 'Log entries').map(l => {
      if (!isObj(l) || !teamRefs.has(String(l.team))) throw badRequest(`A log entry in "${name}" points at an unknown team.`)
      const undoneAt = l.undone_at ? iso(l.undone_at, now) : null
      return {
        team: String(l.team),
        round: l.round != null && roundRefs.has(String(l.round)) ? String(l.round) : null,
        delta: int(l.delta),
        new_score: int(l.new_score),
        created_at: iso(l.created_at, now),
        by_me: l.by_me === true,
        undone_at: undoneAt,
        undone_by_me: !!undoneAt && l.undone_by_me === true,
      }
    })

    let presets = Array.isArray(s.point_presets)
      ? s.point_presets.map(Number).filter(n => Number.isFinite(n) && n !== 0).map(Math.trunc).slice(0, 24)
      : null
    if (!presets?.length) presets = [5, 10, 15, -5, -10, -15]
    const scale = Number(s.logo_scale)

    let logo = null
    if (isObj(g.logo) && typeof g.logo.data === 'string') {
      if (!allowedTypes().includes(g.logo.type)) throw badRequest(`The logo of "${name}" has an unsupported image type.`)
      const buffer = Buffer.from(g.logo.data, 'base64')
      if (!buffer.length || buffer.length > LIMITS.logoBytes) throw badRequest(`The logo of "${name}" is empty or too large.`)
      logo = { type: g.logo.type, buffer }
    }

    return {
      name,
      created_at: iso(g.created_at, now),
      archived: g.archived === true,
      allow_negative: s.allow_negative === true,
      rounds_enabled: s.rounds_enabled === true,
      current_round: s.current_round != null && roundRefs.has(String(s.current_round)) ? String(s.current_round) : null,
      point_presets: presets,
      team_sort: oneOf(s.team_sort, ['manual', 'asc', 'desc'], 'manual'),
      cover_color: hex(s.cover_color),
      logo_placement: logo ? oneOf(s.logo_placement, ['center', 'top', 'menu'], 'center') : null,
      logo_shape: oneOf(s.logo_shape, ['circle', 'square'], 'circle'),
      logo_scale: Number.isFinite(scale) && scale >= 0.4 && scale <= 1.6 ? scale : 1,
      logo, teams, rounds, logs,
    }
  })
}

/**
 * Creates every game in `file` for `userId`. All rows go in one transaction;
 * logo files are written afterwards so a failed import leaves no stray files.
 * @returns {string[]} the new game ids, in file order
 */
export function importGames(userId, file) {
  const games = parseFile(file)
  const now = nowIso()

  const created = tx(() => games.map(g => {
    const gameId = crypto.randomUUID()
    const teamIds = new Map(g.teams.map(t => [t.ref, crypto.randomUUID()]))
    const roundIds = new Map(g.rounds.map(r => [r.ref, crypto.randomUUID()]))

    run(`INSERT INTO games (id, user_id, name, allow_negative, rounds_enabled, point_presets, team_sort,
                            cover_color, logo_shape, logo_scale, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      gameId, userId, g.name, g.allow_negative ? 1 : 0, g.rounds_enabled ? 1 : 0,
      JSON.stringify(g.point_presets), g.team_sort, g.cover_color, g.logo_shape, g.logo_scale,
      g.archived ? now : null, g.created_at, now)

    for (const t of g.teams) {
      run('INSERT INTO teams (id, game_id, name, color, score, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        teamIds.get(t.ref), gameId, t.name, t.color, t.score, t.position, t.created_at)
    }
    for (const r of g.rounds) {
      run('INSERT INTO rounds (id, game_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
        roundIds.get(r.ref), gameId, r.name, r.position, r.created_at)
    }
    if (g.current_round) {
      run('UPDATE games SET current_round_id = ? WHERE id = ?', roundIds.get(g.current_round), gameId)
    }
    const insertLog = `INSERT INTO point_logs (id, team_id, game_id, user_id, round_id, delta, new_score, created_at, undone_at, undone_by)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    for (const l of g.logs) {
      run(insertLog, crypto.randomUUID(), teamIds.get(l.team), gameId, l.by_me ? userId : null,
        l.round ? roundIds.get(l.round) : null, l.delta, l.new_score, l.created_at,
        l.undone_at, l.undone_by_me ? userId : null)
    }
    return { gameId, logo: g.logo, placement: g.logo_placement }
  }))

  for (const { gameId, logo, placement } of created) {
    if (!logo) continue
    const rel = saveLogo({ userId, gameId, buffer: logo.buffer, contentType: logo.type })
    if (rel) run('UPDATE games SET logo_path = ?, logo_placement = ? WHERE id = ?', rel, placement, gameId)
  }
  return created.map(c => c.gameId)
}
