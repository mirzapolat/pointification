import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, logoUrl } from '../lib/supabase'
import AnimatedNumber from '../components/AnimatedNumber.jsx'
import { LogoCenterBadge, LogoTopRow } from './GameScreen.jsx'

export default function PublicGame() {
  const { token } = useParams()
  const [game, setGame] = useState(null)
  const [teams, setTeams] = useState([])
  const [status, setStatus] = useState('loading') // loading | ok | notfound
  const [flash, setFlash] = useState({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: g } = await supabase
        .from('games')
        .select('id, name, public_token, is_public, logo_path, logo_placement, logo_shape, logo_scale')
        .eq('public_token', token)
        .eq('is_public', true)
        .maybeSingle()
      if (cancelled) return
      if (!g) { setStatus('notfound'); return }
      const { data: t } = await supabase
        .from('teams')
        .select('id, name, color, score, position')
        .eq('game_id', g.id)
        .order('position')
      if (cancelled) return
      setGame(g)
      setTeams(t ?? [])
      setStatus('ok')
    })()
    return () => { cancelled = true }
  }, [token])

  // Realtime: anon respects RLS, which allows reading public games + their teams.
  useEffect(() => {
    if (!game?.id) return
    const channel = supabase.channel(`public-game:${game.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams', filter: `game_id=eq.${game.id}` },
        (payload) => {
          setTeams(prev => {
            const idx = prev.findIndex(t => t.id === payload.new.id)
            if (idx === -1) return prev
            const prevScore = prev[idx].score
            const next = [...prev]
            next[idx] = { ...next[idx], ...payload.new }
            if (payload.new.score !== prevScore) {
              setFlash(f => ({ ...f, [payload.new.id]: (f[payload.new.id] ?? 0) + 1 }))
            }
            return next
          })
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'teams', filter: `game_id=eq.${game.id}` },
        (payload) => setTeams(prev => prev.some(t => t.id === payload.new.id)
          ? prev : [...prev, payload.new].sort((a, b) => a.position - b.position)))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'teams', filter: `game_id=eq.${game.id}` },
        (payload) => setTeams(prev => prev.filter(t => t.id !== payload.old.id)))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
        (payload) => {
          // Sharing was turned off, or token rotated → kick out
          if (!payload.new.is_public || payload.new.public_token !== token) setStatus('notfound')
          else setGame(g => ({ ...g, ...payload.new }))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [game?.id, token])

  if (status === 'loading') {
    return <div className="h-full grid place-items-center bg-cream font-display text-3xl animate-pulse">loading…</div>
  }
  if (status === 'notfound') {
    return (
      <div className="h-full grid place-items-center bg-cream">
        <div className="card-chunk p-8 text-center max-w-sm">
          <div className="text-5xl mb-3">🔒</div>
          <h2 className="font-display text-3xl font-bold">Not available</h2>
          <p className="text-ink/60 mt-2">This link is invalid or the owner turned sharing off.</p>
          <Link to="/" className="btn-chunk bg-candy-mint mt-5">Go home</Link>
        </div>
      </div>
    )
  }

  const logoSrc = game?.logo_path ? logoUrl(game.logo_path) : null
  const showCenter = !!logoSrc && game?.logo_placement === 'center'
  const showTop = !!logoSrc && game?.logo_placement === 'top'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex flex-col bg-ink">
      <header className="shrink-0 px-4 md:px-6 py-3 flex items-center justify-between bg-cream border-b-2 border-ink z-10">
        <Link
          to="/landing"
          aria-label="Make your own scoreboard at Pointification"
          title="Make your own scoreboard"
          className="group flex items-center gap-2 rounded-xl -mx-1 px-1 py-0.5 transition hover:-translate-y-0.5"
        >
          <img src="/pointification.png" alt="Pointification" className="w-8 h-8 object-contain transition-transform group-hover:rotate-[-6deg]" />
          <span className="font-display font-semibold hidden sm:inline">Pointification</span>
          <span className="hidden md:inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full border-2 border-ink bg-candy-yellow text-[11px] font-bold uppercase tracking-wider shadow-chunk-sm transition-transform group-hover:-translate-y-0.5">
            Make your own
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </Link>
        <h1 className="font-display font-bold text-xl md:text-2xl truncate px-3">{game.name}</h1>
        <span className="px-2.5 py-1 rounded-full border-2 border-ink bg-white text-xs font-bold uppercase tracking-wider">
          live
        </span>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {showTop && <LogoTopRow src={logoSrc} />}
        {teams.length === 0
          ? <div className="flex-1 grid place-items-center text-cream/70 font-display text-xl">No teams yet.</div>
          : teams.map((t, i) => (
              <Row key={t.id} team={t} index={i} flashKey={flash[t.id] ?? 0} compact={showCenter} />
            ))}
        {showCenter && <LogoCenterBadge src={logoSrc} shape={game.logo_shape} scale={game.logo_scale} />}
      </div>
    </motion.div>
  )
}

function Row({ team, index, flashKey, compact }) {
  const padX = compact ? 'pl-6 pr-6 md:pl-12 md:pr-12' : 'px-6 md:px-12'
  const nameSize = compact
    ? 'text-2xl sm:text-3xl md:text-5xl lg:text-6xl'
    : 'text-3xl sm:text-4xl md:text-6xl lg:text-7xl'
  const scoreSize = compact
    ? 'text-3xl sm:text-4xl md:text-6xl lg:text-7xl'
    : 'text-4xl sm:text-5xl md:text-7xl lg:text-8xl'
  return (
    <motion.div
      initial={{ opacity: 0, x: index % 2 === 0 ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 140, damping: 18, delay: index * 0.05 }}
      className={`relative flex-1 min-h-0 flex items-center justify-between ${padX} border-b-2 border-ink last:border-b-0 overflow-hidden`}
      style={{ background: team.color }}
    >
      <AnimatePresence>
        {flashKey > 0 && (
          <motion.div
            key={flashKey}
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute inset-0 bg-white pointer-events-none"
          />
        )}
      </AnimatePresence>
      <div className={`relative z-10 flex items-center gap-3 md:gap-5 min-w-0 ${compact ? 'pr-[20%] sm:pr-[14%] md:pr-[14%]' : ''}`}>
        <div className="w-3 md:w-4 h-12 md:h-16 rounded-full bg-ink/15" />
        <h2 className={`font-display font-bold truncate ${nameSize}`}>{team.name}</h2>
      </div>
      <div className={`relative z-10 font-display font-bold tabular-nums ${scoreSize}`}>
        <AnimatedNumber value={team.score} />
      </div>
    </motion.div>
  )
}
