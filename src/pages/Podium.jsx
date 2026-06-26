import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'

const DEFAULT_SIZE = 3
const MAX_SIZE = 20

function makePositionOrder(n) {
  const order = []
  for (let i = 0; i < n; i++) {
    if (i === 0) order.push(0)
    else if (i % 2 === 1) order.unshift(i)
    else order.push(i)
  }
  return order
}

function rankHeight(rank, total) {
  const span = Math.max(1, total - 1)
  const t = (rank - 1) / span
  const maxPx = 380
  const minPx = 110
  const maxVh = 38
  const minVh = 11
  const px = Math.round(maxPx - (maxPx - minPx) * t)
  const vh = Math.round((maxVh - (maxVh - minVh) * t) * 10) / 10
  return `min(${vh}vh, ${px}px)`
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }
function rankMedal(rank) {
  return RANK_MEDAL[rank] ?? '🏅'
}

const CONFETTI_COLORS = ['#FF4FA3', '#FFD93D', '#5EE2C1', '#4D7CFF', '#9B6DFF', '#FF7A59']

export default function Podium() {
  const { id } = useParams()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const requestedSize = Number.parseInt(params.get('size') ?? '', 10)
  const desiredCount = Number.isFinite(requestedSize) && requestedSize > 0
    ? Math.min(requestedSize, MAX_SIZE)
    : DEFAULT_SIZE

  const [game, setGame] = useState(null)
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: g }, { data: t }] = await Promise.all([
        supabase.from('games').select('id, name').eq('id', id).single(),
        supabase.from('teams').select('id, name, color, score').eq('game_id', id),
      ])
      if (cancelled) return
      setGame(g)
      setTeams(t ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id])

  const maxCount = Math.max(1, teams.length)
  const count = Math.min(desiredCount, maxCount)

  const ranked = useMemo(
    () => [...teams].sort((a, b) => b.score - a.score).slice(0, count),
    [teams, count]
  )

  // Standard competition ranking: equal scores share a place (1, 2, 2, 4…)
  const ranks = useMemo(() => {
    const out = []
    for (let i = 0; i < ranked.length; i++) {
      if (i > 0 && ranked[i].score === ranked[i - 1].score) out.push(out[i - 1])
      else out.push(i + 1)
    }
    return out
  }, [ranked])

  // Unique place values, best → worst (e.g. [1, 2, 4]); one reveal step per group
  const uniqueRanks = useMemo(() => [...new Set(ranks)], [ranks])

  const totalSteps = uniqueRanks.length

  useEffect(() => { setStep(0) }, [count])

  const setCount = (n) => {
    const clamped = Math.max(1, Math.min(MAX_SIZE, n))
    const next = new URLSearchParams(params)
    next.set('size', String(clamped))
    setParams(next)
    setStep(0)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        setStep(s => Math.min(s + 1, totalSteps))
      } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setStep(s => Math.max(s - 1, 0))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setStep(s => Math.min(s + 1, totalSteps))
      } else if (e.key === 'r' || e.key === 'R') {
        setStep(0)
      } else if (e.key === 'Escape') {
        nav(`/game/${id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [totalSteps, id, nav])

  if (loading) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-cream font-display text-3xl animate-pulse">
        loading…
      </div>
    )
  }

  if (!game) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-cream">
        <div className="card-chunk p-8 text-center">
          <h2 className="font-display text-3xl font-bold">Game not found</h2>
          <button onClick={() => nav('/')} className="btn-chunk bg-candy-mint mt-4">← Back</button>
        </div>
      </div>
    )
  }

  const slotOrder = makePositionOrder(ranked.length)
  const totalRanks = ranked.length
  const finished = totalSteps > 0 && step >= totalSteps
  // The place value about to be revealed by the next step (worst group first)
  const nextRank = step < totalSteps ? uniqueRanks[totalSteps - step - 1] : 1
  const hasTeams = ranked.length > 0

  return (
    <div
      className="fixed inset-0 bg-cream bg-grid overflow-hidden flex flex-col select-none"
      onClick={() => setStep(s => (s < totalSteps ? s + 1 : s))}
    >
      <StageBackground />

      <header
        className="relative z-20 px-4 md:px-8 py-4 flex items-start justify-between gap-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 md:gap-6 min-w-0">
          <button
            onClick={() => nav(`/game/${id}/log`)}
            className="btn-chunk bg-white text-sm py-2 px-3"
            aria-label="Exit podium"
            title="Exit podium"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            <span className="hidden md:inline">Exit</span>
          </button>
          <div className="hidden md:flex min-w-0 items-baseline gap-2 md:gap-3">
            <h1 className="font-display font-bold text-xl md:text-2xl truncate leading-none">{game.name}</h1>
            <div className="text-xs md:text-sm text-ink/60 shrink-0">Podium</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-2xl border-2 border-ink bg-white shadow-chunk-sm">
            <button
              onClick={() => setCount(count - 1)}
              disabled={count <= 1}
              className="w-8 h-8 grid place-items-center rounded-xl font-display font-bold text-xl leading-none text-ink/70 hover:text-ink hover:bg-cream disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink/70"
              aria-label="Decrease podium size"
              title="Smaller podium"
            >
              −
            </button>
            <div className="px-2 min-w-[4.5rem] text-center font-display font-semibold text-sm select-none">
              {count === 1 ? 'Winner' : `Top ${count}`}
            </div>
            <button
              onClick={() => setCount(count + 1)}
              disabled={count >= maxCount}
              className="w-8 h-8 grid place-items-center rounded-xl font-display font-bold text-xl leading-none text-ink/70 hover:text-ink hover:bg-cream disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink/70"
              aria-label="Increase podium size"
              title="Larger podium"
            >
              +
            </button>
          </div>
          <button
            onClick={() => setStep(0)}
            disabled={step === 0}
            className="btn-chunk bg-white text-sm py-2 px-3 disabled:opacity-40"
            aria-label="Reset"
            title="Reset (R)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            <span className="hidden md:inline">Reset</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-end justify-center px-4 md:px-8 pb-24 md:pb-28">
        {!hasTeams ? (
          <div className="m-auto card-chunk p-10 text-center">
            <div className="text-5xl mb-2">🎈</div>
            <h2 className="font-display font-bold text-2xl">No teams to crown</h2>
            <p className="text-ink/60 mt-1">Add some teams and play a round first.</p>
          </div>
        ) : (
          <div className="flex items-end justify-center gap-2 md:gap-4 w-full max-w-6xl">
            {slotOrder.map(i => {
              const team = ranked[i]
              const rank = ranks[i]
              // Reveal worst group first; tied teams share a group and appear together
              const groupIndex = uniqueRanks.indexOf(rank)
              const revealed = step >= (totalSteps - groupIndex)
              return (
                <PodiumSlot
                  key={team.id}
                  team={team}
                  rank={rank}
                  total={totalRanks}
                  revealed={revealed}
                  isWinner={rank === 1}
                />
              )
            })}
          </div>
        )}
      </main>

      <div
        className="relative z-20 pb-5 md:pb-7 px-4 text-center pointer-events-none"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={!hasTeams ? 'empty' : finished ? 'done' : step === 0 ? 'start' : 'next'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="font-display font-semibold text-ink/70 text-sm md:text-base"
          >
            {!hasTeams ? null : step === 0 ? (
              <>Press <KeyChip>SPACE</KeyChip> to reveal {nextRankLabel(nextRank)}</>
            ) : !finished ? (
              <>Press <KeyChip>SPACE</KeyChip> for {nextRankLabel(nextRank)}</>
            ) : (
              <>🎉 Press <KeyChip>R</KeyChip> to replay · <KeyChip>ESC</KeyChip> to exit</>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {finished && <Confetti />}
    </div>
  )
}

function nextRankLabel(rank) {
  if (rank === 1) return 'the winner'
  return `${ordinal(rank)} place`
}

function PodiumSlot({ team, rank, total, revealed, isWinner }) {
  const height = rankHeight(rank, total)
  const medal = rankMedal(rank)
  const label = ordinal(rank)

  const widthClass = isWinner
    ? 'w-28 sm:w-36 md:w-52'
    : rank <= 3
      ? 'w-20 sm:w-28 md:w-40'
      : 'w-16 sm:w-24 md:w-32'

  return (
    <div className={`flex flex-col items-center ${widthClass} shrink-0`}>
      <div className="relative w-full mb-3 md:mb-4 min-h-[7.5rem] md:min-h-[10rem]">
        <AnimatePresence>
          {revealed && (
            <motion.div
              key="card-wrap"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-0 bottom-0"
            >
              {isWinner && (
                <motion.div
                  initial={{ y: -140, scale: 0, rotate: -40, opacity: 0 }}
                  animate={{
                    y: -8,
                    scale: 1,
                    rotate: [0, -8, 8, -4, 4, 0],
                    opacity: 1,
                  }}
                  transition={{
                    y: { type: 'spring', stiffness: 200, damping: 11, delay: 0.5 },
                    scale: { type: 'spring', stiffness: 240, damping: 12, delay: 0.5 },
                    opacity: { duration: 0.2, delay: 0.5 },
                    rotate: { duration: 1.0, delay: 1.0, ease: 'easeInOut' },
                  }}
                  className="absolute left-1/2 -top-14 md:-top-16 -translate-x-1/2 text-5xl md:text-7xl pointer-events-none drop-shadow-[3px_3px_0_#0F0F12]"
                  aria-hidden
                >
                  👑
                </motion.div>
              )}
              <motion.div
                initial={{ y: 70, opacity: 0, scale: 0.55, rotate: -10 }}
                animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
                exit={{ y: 30, opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.2 }}
                className={`card-chunk relative p-2.5 md:p-4 text-center ${isWinner ? 'bg-candy-yellow' : 'bg-white'}`}
                style={isWinner ? { boxShadow: '8px 8px 0 0 #0F0F12' } : undefined}
              >
                <div className="text-2xl md:text-3xl leading-none" aria-hidden>{medal}</div>
                <div className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-ink/60 mt-0.5">
                  {label} place
                </div>
                <div
                  className="font-display font-bold text-base md:text-2xl leading-tight mt-1 break-words"
                  title={team.name}
                >
                  {team.name}
                </div>
                <div className="mt-1.5 inline-flex items-baseline gap-1">
                  <span className="font-display font-bold text-xl md:text-3xl tabular-nums">
                    <ScoreCounter to={team.score} />
                  </span>
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-ink/60">pts</span>
                </div>
                {isWinner && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 250, damping: 12, delay: 0.9 }}
                    aria-hidden
                    className="absolute -top-2 -right-2 w-9 h-9 md:w-11 md:h-11 rounded-full border-2 border-ink bg-candy-pink text-white grid place-items-center text-lg md:text-xl"
                  >
                    ★
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full relative" style={{ height }}>
        <div className="absolute inset-0 rounded-t-2xl border-2 border-dashed border-ink/15 bg-ink/5" />
        <AnimatePresence>
          {revealed && (
            <motion.div
              key="pedestal"
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              exit={{ scaleY: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 140, damping: 18, mass: 0.9 }}
              style={{ background: team.color, transformOrigin: 'bottom' }}
              className="absolute inset-0 rounded-t-2xl border-2 border-ink shadow-chunk overflow-hidden grid place-items-center"
            >
              <div className="absolute inset-0 bg-dots opacity-25" />
              <motion.div
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45, type: 'spring', stiffness: 220, damping: 16 }}
                className="font-display font-bold text-white tabular-nums leading-none"
                style={{
                  fontSize: isWinner ? 'clamp(3rem, 8vw, 6rem)' : rank <= 3 ? 'clamp(2rem, 5vw, 4rem)' : 'clamp(1.5rem, 3.5vw, 3rem)',
                  textShadow: '3px 3px 0 #0F0F12',
                }}
              >
                {rank}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function ScoreCounter({ to }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf
    const start = performance.now()
    const dur = 1100
    const from = 0
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(from + (to - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{val}</>
}

function KeyChip({ children }) {
  return (
    <span className="inline-block px-2 py-0.5 mx-0.5 rounded-md border-2 border-ink bg-white text-ink font-display font-bold text-xs md:text-sm shadow-chunk-sm align-middle">
      {children}
    </span>
  )
}

function StageBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-candy-pink/20 blur-3xl" />
      <div className="absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-candy-mint/20 blur-3xl" />
      <div className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-candy-yellow/25 blur-3xl" />
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-ink/20" />
    </div>
  )
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 3.4 + Math.random() * 2.2,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 8 + Math.random() * 9,
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 80,
      })),
    []
  )
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden>
      {pieces.map(p => (
        <motion.div
          key={p.id}
          initial={{ y: '-10vh', x: 0, rotate: p.rotate, opacity: 0 }}
          animate={{
            y: '110vh',
            x: p.drift,
            rotate: p.rotate + 720,
            opacity: [0, 1, 1, 0.9],
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.5,
            background: p.color,
            border: '1.5px solid #0F0F12',
            position: 'absolute',
            borderRadius: 2,
            top: 0,
          }}
        />
      ))}
    </div>
  )
}
