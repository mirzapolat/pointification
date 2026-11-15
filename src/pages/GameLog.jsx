import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import * as api from '../lib/api'
import { subscribeToGame } from '../lib/realtime'
import AuditLog from '../components/AuditLog.jsx'

/** The game's audit log for owner and collaborators (names plus emails). */
export default function GameLog() {
  const { id } = useParams()
  const nav = useNavigate()
  const [game, setGame] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const loadLogs = async () => {
    const { data } = await api.listAuditLog(id)
    setLogs(data ?? [])
  }

  const load = async () => {
    const [{ data: g }] = await Promise.all([api.getGame(id), loadLogs()])
    setGame(g ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // New changes and undos both arrive as point_logs events; teams/rounds for renames.
  useEffect(() => subscribeToGame(id, {
    point_logs: loadLogs,
    teams: ({ type }) => { if (type !== 'UPDATE') load() },
    rounds: load,
    games: ({ type, row }) => {
      if (type === 'DELETE') nav('/', { replace: true })
      else setGame(g => (g ? { ...g, ...row } : g))
    },
  }), [id])

  if (loading) {
    return <div className="h-full grid place-items-center bg-cream font-display text-3xl animate-pulse">loading…</div>
  }
  if (!game) {
    return (
      <div className="h-full grid place-items-center bg-cream">
        <div className="card-chunk p-8 text-center">
          <h2 className="font-display text-3xl font-bold">Game not found</h2>
          <Link to="/" className="btn-chunk bg-candy-mint mt-4">← Back</Link>
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full pb-home bg-cream bg-grid">
      <header className="px-safe [--px:1rem] md:[--px:2rem] py-3 md:py-4 flex items-center justify-between gap-3 bg-cream/80 backdrop-blur border-b-2 border-ink sticky top-0 z-20">
        <button
          onClick={() => nav(`/game/${id}`)}
          className="btn-chunk bg-white text-sm h-10 py-0 px-2.5 md:px-3 shrink-0"
          aria-label="Back to game"
          title="Back to game"
        >
          <BackIcon className="md:hidden" />
          <span className="hidden md:inline">← Game</span>
        </button>
        <div className="min-w-0 text-center flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink/50 leading-none mb-1">Log</div>
          <h1 className="font-display font-bold text-lg md:text-2xl truncate leading-none">{game.name}</h1>
        </div>
        <Link
          to={`/game/${id}/analytics`}
          className="btn-chunk bg-candy-mint text-sm h-10 py-0 px-2.5 md:px-3 shrink-0"
          aria-label="Open analytics"
          title="Open analytics"
        >
          <ChartIcon />
          <span className="hidden md:inline">Analytics</span>
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-4">
        {game.is_public && game.public_log && (
          <p className="text-xs text-ink/60 px-1">
            This log is visible on the public link, with names only (no emails).
          </p>
        )}
        <AuditLog logs={logs} teams={game.teams ?? []} rounds={game.rounds_enabled ? game.rounds ?? [] : []} showEmail />
      </main>
    </motion.div>
  )
}

export function BackIcon({ className = '' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>
    </svg>
  )
}
