import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, logoUrl } from '../lib/supabase'
import AnimatedNumber from '../components/AnimatedNumber.jsx'
import PointPopup from '../components/PointPopup.jsx'
import { useDialogs } from '../components/Dialogs.jsx'

export default function GameScreen() {
  const { id } = useParams()
  const nav = useNavigate()
  const [game, setGame] = useState(null)
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null) // team id with popup open
  const [flash, setFlash] = useState({})     // { [teamId]: +n or -n }
  const [busy, setBusy] = useState(false)
  const dialogs = useDialogs()

  const load = async () => {
    const [{ data: g }, { data: t }] = await Promise.all([
      supabase.from('games').select('id, name, allow_negative, logo_path, logo_placement, logo_shape, logo_scale, point_presets, team_sort').eq('id', id).single(),
      supabase.from('teams').select('id, name, color, score, position').eq('game_id', id).order('position')
    ])
    setGame(g ?? null)
    setTeams(t ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // Realtime: keep scores, team list, and game metadata in sync across viewers.
  useEffect(() => {
    const channel = supabase.channel(`game:${id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams', filter: `game_id=eq.${id}` },
        (payload) => {
          setTeams(prev => {
            const idx = prev.findIndex(t => t.id === payload.new.id)
            if (idx === -1) return prev
            const prevScore = prev[idx].score
            const next = [...prev]
            next[idx] = { ...next[idx], ...payload.new }
            // Flash only if score actually changed (not, e.g., rename)
            if (payload.new.score !== prevScore) {
              setFlash(f => ({ ...f, [payload.new.id]: (f[payload.new.id] ?? 0) + 1 }))
            }
            return next
          })
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'teams', filter: `game_id=eq.${id}` },
        (payload) => {
          setTeams(prev => prev.some(t => t.id === payload.new.id)
            ? prev
            : [...prev, payload.new].sort((a, b) => a.position - b.position))
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'teams', filter: `game_id=eq.${id}` },
        (payload) => {
          setTeams(prev => prev.filter(t => t.id !== payload.old.id))
          setActive(a => a === payload.old.id ? null : a)
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` },
        (payload) => setGame(g => g ? { ...g, ...payload.new } : g))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'games', filter: `id=eq.${id}` },
        () => nav('/', { replace: true }))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, nav])

  const applyDelta = async (teamId, delta) => {
    setBusy(true)
    const allowNeg = !!game?.allow_negative
    let effective = delta
    setTeams(prev => prev.map(t => {
      if (t.id !== teamId) return t
      const target = t.score + delta
      const clamped = !allowNeg && target < 0 ? -t.score : delta
      effective = clamped
      return { ...t, score: t.score + clamped }
    }))
    if (effective === 0) { setBusy(false); return }
    setFlash(f => ({ ...f, [teamId]: (f[teamId] ?? 0) + 1 }))
    const { error } = await supabase.rpc('apply_point_change', { p_team_id: teamId, p_delta: delta })
    if (error) {
      setTeams(prev => prev.map(t => t.id === teamId ? { ...t, score: t.score - effective } : t))
      dialogs.alert({ title: 'Could not apply', message: error.message })
    }
    setBusy(false)
  }

  const sortedTeams = useMemo(
    () => sortTeams(teams, game?.team_sort),
    [teams, game?.team_sort]
  )

  if (loading) {
    return <div className="h-full grid place-items-center bg-cream font-display text-3xl animate-pulse">loading…</div>
  }
  if (!game) {
    return (
      <div className="h-full grid place-items-center bg-cream">
        <div className="card-chunk p-8 text-center">
          <h2 className="font-display text-3xl font-bold">Game not found</h2>
          <button onClick={() => nav('/')} className="btn-chunk bg-candy-mint mt-4">← Back</button>
        </div>
      </div>
    )
  }

  const activeTeam = teams.find(t => t.id === active)
  const logoSrc = game.logo_path ? logoUrl(game.logo_path) : null
  const showCenter = !!logoSrc && game.logo_placement === 'center'
  const showTop = !!logoSrc && game.logo_placement === 'top'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex flex-col bg-ink">
      {/* top bar */}
      <header className="shrink-0 px-4 md:px-6 py-3 flex items-center justify-between bg-cream border-b-2 border-ink z-10">
        <button onClick={() => nav('/')} className="btn-chunk bg-white text-sm py-2 px-3">← Games</button>
        <h1 className="font-display font-bold text-xl md:text-2xl truncate px-3">{game.name}</h1>
        <div className="text-sm text-ink/60 hidden md:block">{teams.length} {teams.length === 1 ? 'team' : 'teams'}</div>
      </header>

      {/* fill remaining */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {showTop && <LogoTopRow src={logoSrc} />}
        {sortedTeams.length === 0 ? (
          <div className="flex-1 grid place-items-center text-cream/70 font-display text-xl">No teams. Edit the game to add some.</div>
        ) : sortedTeams.map((t, i) => (
          <TeamRow
            key={t.id}
            team={t}
            index={i}
            flashKey={flash[t.id] ?? 0}
            onClick={() => setActive(t.id)}
            compact={showCenter}
          />
        ))}
        {showCenter && <LogoCenterBadge src={logoSrc} shape={game.logo_shape} scale={game.logo_scale} />}
      </div>

      <AnimatePresence>
        {activeTeam && (
          <PointPopup
            team={activeTeam}
            presets={game.point_presets}
            busy={busy}
            onApply={async (n) => { await applyDelta(activeTeam.id, n) }}
            onClose={() => setActive(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function TeamRow({ team, index, flashKey, onClick, compact }) {
  // In compact mode, leave a clear gutter around the centered logo so the
  // big team name / score don't slide under the bubble.
  const padX = compact
    ? 'pl-6 pr-6 md:pl-12 md:pr-12'
    : 'px-6 md:px-12'
  const nameSize = compact
    ? 'text-2xl sm:text-3xl md:text-5xl lg:text-6xl'
    : 'text-3xl sm:text-4xl md:text-6xl lg:text-7xl'
  const scoreSize = compact
    ? 'text-3xl sm:text-4xl md:text-6xl lg:text-7xl'
    : 'text-4xl sm:text-5xl md:text-7xl lg:text-8xl'
  return (
    <motion.button
      onClick={onClick}
      layout="position"
      initial={{ opacity: 0, x: index % 2 === 0 ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        default: { type: 'spring', stiffness: 140, damping: 18, delay: index * 0.05 },
        layout: { type: 'spring', stiffness: 260, damping: 26 },
      }}
      whileTap={{ scale: 0.995 }}
      className={`relative flex-1 min-h-0 flex items-center justify-between ${padX} border-b-2 border-ink last:border-b-0 overflow-hidden text-left`}
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
        <h2 className={`font-display font-bold truncate ${nameSize}`}>
          {team.name}
        </h2>
      </div>
      <div className={`relative z-10 font-display font-bold tabular-nums ${scoreSize}`}>
        <AnimatedNumber value={team.score} />
      </div>
    </motion.button>
  )
}

export function LogoCenterBadge({ src, shape = 'circle', scale = 0.8 }) {
  const pct = Math.max(40, Math.min(160, Math.round(scale * 100)))
  const radius = shape === 'square' ? 'rounded-3xl' : 'rounded-full'
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 16 }}
        className={`${radius} border-2 border-ink bg-white shadow-chunk grid place-items-center overflow-hidden w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 lg:w-72 lg:h-72`}
      >
        <img
          src={src}
          alt="Game logo"
          className="object-contain"
          style={{ width: `${pct}%`, height: `${pct}%` }}
        />
      </motion.div>
    </div>
  )
}

export function sortTeams(teams, mode) {
  if (mode === 'asc') {
    return [...teams].sort((a, b) => a.score - b.score || a.position - b.position)
  }
  if (mode === 'desc') {
    return [...teams].sort((a, b) => b.score - a.score || a.position - b.position)
  }
  return teams
}

export function LogoTopRow({ src }) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 160, damping: 18 }}
      className="flex-1 min-h-0 bg-white border-b-2 border-ink px-6 md:px-12 py-3 md:py-5"
    >
      <img
        src={src}
        alt="Game logo"
        className="block w-full h-full object-contain"
      />
    </motion.div>
  )
}
