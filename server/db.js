// SQLite connection. Uses node:sqlite (built into Node 22.5+), so there is no
// native module to compile and no external database process to run.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Default lives under ./data so a single bind-mount persists the whole app state.
export const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(__dirname, '../data/pointification.db')

mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec(readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))

// schema.sql only creates missing tables, so columns added later need an
// explicit ALTER on databases that predate them.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}
ensureColumn('games', 'deleted_at', 'TEXT')

/** Run `fn` inside a transaction, rolling back if it throws. */
export function tx(fn) {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (err) {
    try { db.exec('ROLLBACK') } catch {/* already rolled back */}
    throw err
  }
}

export const nowIso = () => new Date().toISOString()

/** Convenience wrappers so route code reads like queries, not ceremony. */
export const all = (sql, ...params) => db.prepare(sql).all(...params)
export const get = (sql, ...params) => db.prepare(sql).get(...params) ?? null
export const run = (sql, ...params) => db.prepare(sql).run(...params)
