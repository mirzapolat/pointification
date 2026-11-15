import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import * as api from '../lib/api'
import { subscribeToPublicGame } from '../lib/realtime'
import AuditLog from '../components/AuditLog.jsx'
import { BackIcon } from './GameLog.jsx'

/** Read-only log behind a share link, when the owner turned it on. Names only. */
export default function PublicLog() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ok | notfound

  const load = async () => {
    const { data: d } = await api.getPublicLog(token)
    if (!d?.game) { setStatus('notfound'); return }
    setData(d)
    setStatus('ok')
  }

  useEffect(() => { load() }, [token])

  // The public stream only carries scoreboard changes; every score change (and
  // undo) moves a team, so re-read the log then.
  useEffect(() => {
    if (status !== 'ok') return
    return subscribeToPublicGame(token, {
      teams: load,
      games: ({ type, row }) => {
        if (type === 'DELETE' || !row?.is_public || !row.public_log || row.public_token !== token) setStatus('notfound')
      },
    })
  }, [status === 'ok', token])

  if (status === 'loading') {
    return <div className="h-full grid place-items-center bg-cream font-display text-3xl animate-pulse">loading…</div>
  }
  if (status === 'notfound') {
    return (
      <div className="h-full grid place-items-center bg-cream px-4">
        <div className="card-chunk p-8 text-center max-w-sm">
          <div className="text-5xl mb-3" aria-hidden="true">🔒</div>
          <h2 className="font-display text-3xl font-bold">Not available</h2>
          <p className="text-ink/60 mt-2">The owner hasn't shared this game's log.</p>
          <Link to={`/p/${encodeURIComponent(token)}`} className="btn-chunk bg-candy-mint mt-5">Back to scoreboard</Link>
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full pb-home bg-cream bg-grid">
      <header className="px-safe [--px:1rem] md:[--px:2rem] py-3 md:py-4 flex items-center justify-between gap-3 bg-cream/80 backdrop-blur border-b-2 border-ink sticky top-0 z-20">
        <Link
          to={`/p/${encodeURIComponent(token)}`}
          className="btn-chunk bg-white text-sm h-10 py-0 px-2.5 md:px-3 shrink-0"
          aria-label="Back to scoreboard"
          title="Back to scoreboard"
        >
          <BackIcon className="md:hidden" />
          <span className="hidden md:inline">← Scoreboard</span>
        </Link>
        <div className="min-w-0 text-center flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink/50 leading-none mb-1">Log</div>
          <h1 className="font-display font-bold text-lg md:text-2xl truncate leading-none">{data.game.name}</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <AuditLog logs={data.logs} teams={data.teams} rounds={data.rounds} />
      </main>
    </motion.div>
  )
}
