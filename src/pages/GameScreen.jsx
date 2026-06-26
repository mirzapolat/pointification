import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [undoArmed, setUndoArmed] = useState(false) // first tap arms, second confirms
  const [undoBusy, setUndoBusy] = useState(false)
  const [rounds, setRounds] = useState([])
  const [roundNet, setRoundNet] = useState({}) // { [teamId]: net delta within active round }
  const [roundMenu, setRoundMenu] = useState(null) // { left, top, width } | null
  const [isWide, setIsWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
  const roundBtnRef = useRef(null)
  const undoTimer = useRef(null)
  const dialogs = useDialogs()

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const on = () => setIsWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const openRoundMenu = () => {
    if (roundMenu) { setRoundMenu(null); return }
    const r = roundBtnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(220, r.width)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    setRoundMenu({ left, top: r.bottom + 6, width })
  }

  useEffect(() => {
    if (!roundMenu) return
    const onDown = (e) => {
      if (roundBtnRef.current?.contains(e.target)) return
      if (e.target.closest?.('[data-round-menu]')) return
      setRoundMenu(null)
    }
    const onKey = (e) => { if (e.key === 'Escape') setRoundMenu(null) }
    const onScroll = () => setRoundMenu(null)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScroll)
    }
  }, [roundMenu])

  // Recompute the active round's per-team net from the logs. Kept in a ref so
  // the realtime callbacks always call the latest closure without resubscribing.
  const recomputeNetsRef = useRef(() => {})
  recomputeNetsRef.current = async () => {
    const rid = game?.current_round_id
    if (!game?.rounds_enabled || !rid) { setRoundNet({}); return }
    const { data } = await supabase.from('point_logs').select('team_id, delta').eq('game_id', id).eq('round_id', rid)
    const m = {}
    for (const r of data ?? []) m[r.team_id] = (m[r.team_id] ?? 0) + r.delta
    setRoundNet(m)
  }

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  const handleUndo = async () => {
    if (!undoArmed) {
      // First tap: arm, then auto-disarm if not confirmed shortly.
      setUndoArmed(true)
      if (undoTimer.current) clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setUndoArmed(false), 3000)
      return
    }
    // Second tap: confirm.
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoArmed(false)
    setUndoBusy(true)
    const { error } = await supabase.rpc('undo_last_point_change', { p_game_id: id })
    setUndoBusy(false)
    if (error) dialogs.alert({ title: 'Could not undo', message: error.message })
    // Score + log update arrive via realtime.
  }

  const load = async () => {
    const [{ data: g }, { data: t }, { data: r }] = await Promise.all([
      supabase.from('games').select('id, name, allow_negative, rounds_enabled, current_round_id, logo_path, logo_placement, logo_shape, logo_scale, point_presets, team_sort').eq('id', id).single(),
      supabase.from('teams').select('id, name, color, score, position').eq('game_id', id).order('position'),
      supabase.from('rounds').select('id, name, position').eq('game_id', id).order('position'),
    ])
    setGame(g ?? null)
    setTeams(t ?? [])
    setRounds(r ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // Recompute round nets whenever the active round (or the feature) changes.
  useEffect(() => { recomputeNetsRef.current() }, [game?.current_round_id, game?.rounds_enabled])

  // If rounds are on but no active round is set, default to the first one.
  useEffect(() => {
    if (game?.rounds_enabled && !game.current_round_id && rounds.length) {
      const first = [...rounds].sort((a, b) => a.position - b.position)[0]
      setCurrentRound(first.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.rounds_enabled, game?.current_round_id, rounds])

  const setCurrentRound = async (roundId) => {
    setGame(g => g ? { ...g, current_round_id: roundId } : g)
    const { error } = await supabase.from('games').update({ current_round_id: roundId }).eq('id', id)
    if (error) dialogs.alert({ title: 'Could not switch round', message: error.message })
  }

  const addRound = async () => {
    const pos = rounds.length
    const { data, error } = await supabase.from('rounds')
      .insert({ game_id: id, name: `Round ${pos + 1}`, position: pos })
      .select('id, name, position')
      .single()
    if (error) { dialogs.alert({ title: 'Could not add round', message: error.message }); return }
    setRounds(rs => rs.some(r => r.id === data.id) ? rs : [...rs, data])
    setCurrentRound(data.id)
  }

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
              // A score moved → the active round's nets may have changed.
              recomputeNetsRef.current()
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
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rounds', filter: `game_id=eq.${id}` },
        (payload) => setRounds(prev => prev.some(r => r.id === payload.new.id)
          ? prev
          : [...prev, payload.new].sort((a, b) => a.position - b.position)))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${id}` },
        (payload) => setRounds(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r).sort((a, b) => a.position - b.position)))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rounds', filter: `game_id=eq.${id}` },
        (payload) => setRounds(prev => prev.filter(r => r.id !== payload.old.id)))
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
    } else {
      // We updated the score optimistically, so the realtime echo won't trigger
      // a net recompute for this client — do it explicitly.
      recomputeNetsRef.current()
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

  const roundsOn = !!game.rounds_enabled
  const orderedRounds = [...rounds].sort((a, b) => a.position - b.position)
  const curIdx = orderedRounds.findIndex(r => r.id === game.current_round_id)
  const curRound = curIdx >= 0 ? orderedRounds[curIdx] : null

  const roundControls = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => curIdx > 0 && setCurrentRound(orderedRounds[curIdx - 1].id)}
        disabled={curIdx <= 0}
        className="w-9 h-9 grid place-items-center rounded-xl border-2 border-ink bg-white font-display font-bold text-lg leading-none disabled:opacity-30 hover:bg-candy-yellow transition"
        aria-label="Previous round"
        title="Previous round"
      >‹</button>
      <button
        ref={roundBtnRef}
        onClick={openRoundMenu}
        aria-haspopup="menu"
        aria-expanded={!!roundMenu}
        className="px-3 py-1.5 rounded-xl border-2 border-ink bg-white font-display font-semibold text-sm min-w-[8.5rem] text-center truncate hover:bg-candy-yellow transition inline-flex items-center justify-center gap-1.5"
        title="Switch round"
      >
        <span className="truncate">{curRound?.name || 'Round'}</span>
        <span className="text-ink/50 shrink-0">({curIdx >= 0 ? curIdx + 1 : '–'}/{orderedRounds.length})</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${roundMenu ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <button
        onClick={() => curIdx >= 0 && curIdx < orderedRounds.length - 1 && setCurrentRound(orderedRounds[curIdx + 1].id)}
        disabled={curIdx < 0 || curIdx >= orderedRounds.length - 1}
        className="w-9 h-9 grid place-items-center rounded-xl border-2 border-ink bg-white font-display font-bold text-lg leading-none disabled:opacity-30 hover:bg-candy-yellow transition"
        aria-label="Next round"
        title="Next round"
      >›</button>
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex flex-col bg-ink">
      {/* top bar */}
      <header className="shrink-0 px-4 md:px-6 py-3 flex items-center justify-between gap-3 bg-cream border-b-2 border-ink z-10">
        <button onClick={() => nav('/')} className="btn-chunk bg-white text-sm py-2 px-3 shrink-0">← Games</button>
        <div className="flex items-center gap-3 min-w-0 flex-1 justify-center">
          <h1 className="font-display font-bold text-xl md:text-2xl truncate">{game.name}</h1>
          {roundsOn && isWide && <div className="shrink-0">{roundControls}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleUndo}
            disabled={undoBusy}
            className={`btn-chunk text-sm py-2 p-2 md:px-3 inline-flex items-center gap-2 transition-colors disabled:opacity-60 ${undoArmed ? 'bg-candy-pink text-white' : 'bg-white'}`}
            aria-label={undoArmed ? 'Confirm undo' : 'Undo last point change'}
            title={undoArmed ? 'Tap again to confirm' : 'Undo last point change'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            <span className={undoArmed ? 'inline' : 'hidden md:inline'}>{undoArmed ? 'Confirm?' : 'Undo'}</span>
          </button>
          <button
            onClick={() => nav(`/game/${id}/settings`)}
            className="btn-chunk bg-white text-sm py-2 p-2 md:px-3 inline-flex items-center gap-2"
            aria-label="Game settings"
            title="Game settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* round switcher — its own bar on narrow screens, in the header otherwise */}
      {roundsOn && !isWide && (
        <div className="shrink-0 px-3 py-2 flex items-center justify-center bg-cream border-b-2 border-ink z-10">
          {roundControls}
        </div>
      )}

      {roundMenu && createPortal(
        <motion.div
          data-round-menu
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.1 }}
          role="menu"
          style={{ position: 'fixed', left: roundMenu.left, top: roundMenu.top, width: roundMenu.width }}
          className="z-[120] p-1.5 rounded-2xl border-2 border-ink bg-white shadow-chunk max-h-[60vh] overflow-y-auto no-scrollbar"
        >
          {orderedRounds.map((r, i) => {
            const isCur = r.id === game.current_round_id
            return (
              <button
                key={r.id}
                type="button"
                role="menuitem"
                onClick={() => { setRoundMenu(null); if (!isCur) setCurrentRound(r.id) }}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl font-display font-semibold text-sm transition ${isCur ? 'bg-candy-yellow' : 'hover:bg-cream'}`}
              >
                <span className="shrink-0 w-6 h-6 grid place-items-center rounded-lg border-2 border-ink bg-white text-xs tabular-nums">{i + 1}</span>
                <span className="truncate flex-1">{r.name || `Round ${i + 1}`}</span>
                {isCur && <span className="shrink-0 text-xs text-ink/50">current</span>}
              </button>
            )
          })}
          <div className="my-1 border-t-2 border-dashed border-ink/15" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { setRoundMenu(null); addRound() }}
            className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl font-display font-semibold text-sm text-ink hover:bg-candy-mint transition"
          >
            <span className="shrink-0 w-6 h-6 grid place-items-center rounded-lg border-2 border-ink bg-white text-base leading-none">+</span>
            Add round
          </button>
        </motion.div>,
        document.body
      )}

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
            showRound={roundsOn}
            roundDelta={roundNet[t.id] ?? 0}
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

function TeamRow({ team, index, flashKey, onClick, compact, showRound, roundDelta }) {
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
      <div className="relative z-10 flex flex-col items-end gap-1">
        {showRound && roundDelta !== 0 && <RoundChip delta={roundDelta} />}
        <div className={`font-display font-bold tabular-nums ${scoreSize}`}>
          <AnimatedNumber value={team.score} />
        </div>
      </div>
    </motion.button>
  )
}

function RoundChip({ delta }) {
  const up = delta > 0
  const down = delta < 0
  const cls = up ? 'bg-candy-mint text-ink' : down ? 'bg-candy-pink text-white' : 'bg-white/85 text-ink/60'
  const arrow = up ? '▲' : down ? '▼' : '–'
  const num = up ? `+${delta}` : down ? `${delta}` : '0'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border-2 border-ink font-display font-bold text-xs md:text-sm tabular-nums shadow-chunk-sm ${cls}`}>
      <span className="leading-none text-[0.7em]">{arrow}</span>{num}
    </span>
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
