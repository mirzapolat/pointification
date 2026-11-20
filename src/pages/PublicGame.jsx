import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion'
import * as api from '../lib/api'
import { logoUrl } from '../lib/api'
import { subscribeToPublicGame } from '../lib/realtime'
import AnimatedNumber from '../components/AnimatedNumber.jsx'
import { LogoCenterBadge, LogoTopRow, sortTeams } from './GameScreen.jsx'
import { track } from '../lib/analytics.js'
import { useWakeLock } from '../lib/pwa.js'

export default function PublicGame() {
  const { token } = useParams()
  const [game, setGame] = useState(null)
  const [teams, setTeams] = useState([])
  const [status, setStatus] = useState('loading') // loading | ok | notfound
  const [flash, setFlash] = useState({})
  useWakeLock(status === 'ok')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await api.getPublicGame(token)
      if (cancelled) return
      track('public-view', { result: data?.game ? 'ok' : 'notfound' })
      if (!data?.game) { setStatus('notfound'); return }
      setGame(data.game)
      setTeams(data.teams ?? [])
      setStatus('ok')
    })()
    return () => { cancelled = true }
  }, [token])

  // Realtime: the server only streams what a share link is allowed to show.
  useEffect(() => {
    if (!game?.id) return
    return subscribeToPublicGame(token, {
      teams: ({ type, row, old }) => {
        if (type === 'DELETE') {
          setTeams(prev => prev.filter(t => t.id !== old.id))
          return
        }
        setTeams(prev => {
          const idx = prev.findIndex(t => t.id === row.id)
          if (idx === -1) return [...prev, row].sort((a, b) => a.position - b.position)
          const prevScore = prev[idx].score
          const next = [...prev]
          next[idx] = { ...next[idx], ...row }
          if (row.score !== prevScore) {
            // n changes on every update so the row replays; delta picks the up/down animation.
            const delta = row.score - prevScore
            setFlash(f => ({ ...f, [row.id]: { n: (f[row.id]?.n ?? 0) + 1, delta } }))
          }
          return next
        })
      },
      games: ({ type, row }) => {
        // Sharing was turned off, the token rotated, or the game deleted → kick out.
        if (type === 'DELETE' || !row?.is_public || row.public_token !== token) {
          setStatus('notfound')
          return
        }
        setGame(g => ({ ...g, ...row }))
      },
    })
  }, [game?.id, token])

  const sortedTeams = useMemo(
    () => sortTeams(teams, game?.team_sort),
    [teams, game?.team_sort]
  )

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
      <header className="shrink-0 px-safe [--px:1rem] md:[--px:1.5rem] py-3 flex items-center justify-between bg-cream border-b-2 border-ink z-10">
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
        <h1 className="font-display font-bold text-xl md:text-2xl truncate px-3 min-w-0">{game.name}</h1>
        <div className="flex items-center gap-2 shrink-0">
          <ViewMenu token={token} showLog={!!game.public_log} showAnalytics={!!game.public_analytics} />
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {showTop && <LogoTopRow src={logoSrc} />}
        {sortedTeams.length === 0
          ? <div className="flex-1 grid place-items-center text-cream/70 font-display text-xl">No teams yet.</div>
          : sortedTeams.map((t, i) => (
              <Row key={t.id} team={t} index={i} change={flash[t.id]} compact={showCenter} isLast={i === sortedTeams.length - 1} />
            ))}
        {showCenter && <LogoCenterBadge src={logoSrc} shape={game.logo_shape} scale={game.logo_scale} />}
      </div>
    </motion.div>
  )
}

const LOG_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
)
const CHART_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>
  </svg>
)

/** One button that opens a menu with whatever the owner shared: log, analytics. */
function ViewMenu({ token, showLog, showAnalytics }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!showLog && !showAnalytics) return null
  const base = `/p/${encodeURIComponent(token)}`
  const items = [
    showLog && { to: `${base}/log`, label: 'Log', icon: LOG_ICON, hover: 'hover:bg-candy-yellow' },
    showAnalytics && { to: `${base}/analytics`, label: 'Analytics', icon: CHART_ICON, hover: 'hover:bg-candy-mint' },
  ].filter(Boolean)

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-chunk bg-white text-xs h-8 py-0 px-2.5 shadow-chunk-sm"
        title="More views"
      >
        Stats
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 w-44 z-50 p-1.5 rounded-2xl border-2 border-ink bg-white shadow-chunk"
          >
            {items.map(it => (
              <Link
                key={it.to}
                to={it.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-display font-semibold text-sm transition ${it.hover}`}
              >
                <span className="shrink-0 w-6 h-6 grid place-items-center rounded-lg border-2 border-ink bg-white">{it.icon}</span>
                {it.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Row({ team, index, change, compact, isLast }) {
  const padX = `px-safe [--px:1.5rem] md:[--px:3rem] ${isLast ? 'pb-home' : 'border-b-2'}`
  const nameSize = compact
    ? 'text-2xl sm:text-3xl md:text-5xl lg:text-6xl'
    : 'text-3xl sm:text-4xl md:text-6xl lg:text-7xl'
  const scoreSize = compact
    ? 'text-3xl sm:text-4xl md:text-6xl lg:text-7xl'
    : 'text-4xl sm:text-5xl md:text-7xl lg:text-8xl'

  const reduce = useReducedMotion()
  const content = useAnimationControls()
  const score = useAnimationControls()
  // Every change gets its own burst, so quick successive updates overlap
  // instead of cutting each other off.
  const [bursts, setBursts] = useState([])

  useEffect(() => {
    if (!change?.n || !change.delta) return
    const id = `${change.n}-${Date.now()}`
    setBursts(b => [...b.slice(-3), { id, delta: change.delta }])
    const timer = setTimeout(() => setBursts(b => b.filter(x => x.id !== id)), 1600)

    if (!reduce) {
      if (change.delta > 0) {
        content.start({ y: [0, -10, 0], transition: { duration: 0.45, ease: 'easeOut' } })
        score.start({
          scale: [1, 1.35, 0.94, 1.04, 1], rotate: [0, -4, 2, 0, 0],
          transition: { duration: 0.75, times: [0, 0.3, 0.55, 0.8, 1], ease: 'easeOut' },
        })
      } else {
        content.start({ x: [0, -16, 13, -9, 6, -3, 0], transition: { duration: 0.55, ease: 'easeOut' } })
        score.start({
          scaleY: [1, 0.68, 1.1, 0.97, 1], scaleX: [1, 1.18, 0.95, 1.02, 1], y: [0, 12, -3, 0, 0],
          transition: { duration: 0.7, times: [0, 0.25, 0.55, 0.8, 1], ease: 'easeOut' },
        })
      }
    }
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [change?.n])

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: index % 2 === 0 ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        default: { type: 'spring', stiffness: 140, damping: 18, delay: index * 0.05 },
        layout: { type: 'spring', stiffness: 260, damping: 26 },
      }}
      className={`on-color relative flex-1 min-h-0 flex items-center ${padX} border-ink overflow-hidden`}
      style={{ background: team.color }}
    >
      {bursts.map(b => (b.delta > 0
        ? <GainWash key={b.id} reduce={reduce} />
        : <LossWash key={b.id} reduce={reduce} />
      ))}

      <motion.div animate={content} className="relative z-10 flex-1 min-w-0 flex items-center justify-between gap-4">
        <div className={`flex items-center gap-3 md:gap-5 min-w-0 ${compact ? 'pr-[20%] sm:pr-[14%] md:pr-[14%]' : ''}`}>
          <div className="w-3 md:w-4 h-12 md:h-16 rounded-full bg-ink/15" />
          <h2 className={`font-display font-bold truncate ${nameSize}`}>{team.name}</h2>
        </div>
        <div className="relative shrink-0">
          <motion.div
            animate={score}
            style={{ originY: 1 }}
            className={`font-display font-bold tabular-nums ${scoreSize}`}
          >
            <AnimatedNumber value={team.score} duration={700} />
          </motion.div>
          {bursts.map(b => (
            <span key={b.id} className="pointer-events-none absolute inset-0">
              {b.delta > 0 && !reduce && <Sparks />}
              <DeltaChip delta={b.delta} reduce={reduce} />
            </span>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

/** Points gained: a band of light sweeps up through the row. */
function GainWash({ reduce }) {
  if (reduce) {
    return (
      <motion.div
        initial={{ opacity: 0.6 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }}
        className="absolute inset-0 bg-[#fff] pointer-events-none"
      />
    )
  }
  return (
    <>
      <motion.div
        initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
        className="absolute inset-0 bg-[#fff] pointer-events-none"
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: '-100%' }} transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-0 top-0 h-full pointer-events-none bg-gradient-to-t from-transparent via-[#fff]/60 to-transparent"
      />
    </>
  )
}

/** Points lost: the row dims, with the shadow draining downward. */
function LossWash({ reduce }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0.45 }} animate={{ opacity: 0 }}
        transition={{ duration: reduce ? 0.9 : 0.8, ease: 'easeOut' }}
        className="absolute inset-0 bg-[#0F0F12] pointer-events-none"
      />
      {!reduce && (
        <motion.div
          initial={{ y: '-100%', opacity: 0.5 }} animate={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeIn' }}
          className="absolute inset-x-0 top-0 h-full pointer-events-none bg-gradient-to-b from-transparent via-[#0F0F12]/40 to-transparent"
        />
      )}
    </>
  )
}

/** "+N" floats up and away; "−N" drops like it fell off the board. */
function DeltaChip({ delta, reduce }) {
  const up = delta > 0
  const label = up ? `+${delta}` : `−${Math.abs(delta)}`
  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: [0, 1, 1, 0] }, transition: { duration: 1.4, times: [0, 0.1, 0.7, 1] } }
    : up
      ? {
          initial: { opacity: 0, y: 10, scale: 0.4 },
          animate: { opacity: [0, 1, 1, 0], y: [10, -20, -45, -90], scale: [0.4, 1.2, 1, 0.9] },
          transition: { duration: 1.3, times: [0, 0.2, 0.65, 1], ease: 'easeOut' },
        }
      : {
          initial: { opacity: 0, y: -10, scale: 1.3, rotate: 0 },
          animate: { opacity: [0, 1, 1, 0], y: [-10, 0, 20, 100], scale: [1.3, 1, 1, 0.95], rotate: [0, 0, -6, -18] },
          transition: { duration: 1.2, times: [0, 0.12, 0.45, 1], ease: 'easeIn' },
        }
  return (
    // Beside the score rather than above it, so short rows don't clip it.
    <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 md:mr-6">
      <motion.span
        {...motionProps}
        className={`block whitespace-nowrap rounded-full border-2 border-ink px-3 md:px-5 py-0.5 md:py-1.5 font-display font-bold text-xl sm:text-2xl md:text-4xl shadow-chunk-sm ${up ? 'bg-[#fff] text-[#0F0F12]' : 'bg-[#0F0F12] text-[#fff]'}`}
      >
        {label}
      </motion.span>
    </span>
  )
}

const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + 0.3
  const dist = 120 + (i % 3) * 40
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.6, size: i % 2 ? 14 : 20, color: ['#FFD93D', '#FFFFFF', '#5EE2C1'][i % 3] }
})

/** A small burst of sparks from the score. */
function Sparks() {
  return SPARKS.map((p, i) => (
    <motion.span
      key={i}
      initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
      animate={{ x: p.x, y: p.y, scale: [0, 1.2, 0], opacity: [1, 1, 0] }}
      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.05 }}
      className="absolute left-1/2 top-1/2 -ml-2 -mt-2 rounded-full border-2 border-[#0F0F12]"
      style={{ width: p.size, height: p.size, background: p.color }}
    />
  ))
}
