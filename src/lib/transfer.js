// Browser side of game export/import: save an export as a .json download and
// read one back from a picked file. The format itself lives on the server.
import * as api from './api'

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game'
const today = () => new Date().toISOString().slice(0, 10)

function saveJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Downloads every owned game. Resolves to `{ count, error }`. */
export async function downloadAllGames() {
  const { data, error } = await api.exportAllGames()
  if (error) return { count: 0, error }
  if (!data.games.length) return { count: 0, error: new Error('You have no games to export yet.') }
  saveJson(`pointification-games-${today()}.json`, data)
  return { count: data.games.length, error: null }
}

/** Downloads one game. Resolves to `{ error }`. */
export async function downloadGame(game) {
  const { data, error } = await api.exportGame(game.id)
  if (error) return { error }
  saveJson(`pointification-${slug(game.name)}-${today()}.json`, data)
  return { error: null }
}

/** Parses a picked file just enough to describe it before importing. */
export async function readExportFile(file) {
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (data?.format !== 'pointification-games' || !Array.isArray(data.games)) {
    throw new Error('That is not a Pointification export file.')
  }
  if (!data.games.length) throw new Error('That file contains no games.')
  return data
}
