import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'

const SIZES = [
  { id: '1', label: 'Single', count: 1 },
  { id: '3', label: 'Top 3', count: 3 },
  { id: '5', label: 'Top 5', count: 5 },
]

const POSITION_ORDER = {
  0: [],
  1: [0],
  2: [1, 0],
  3: [1, 0, 2],
  4: [3, 1, 0, 2],
  5: [3, 1, 0, 2, 4],
}

const RANK_HEIGHT = {
  1: 'min(38vh, 380px)',
  2: 'min(28vh, 290px)',
  3: 'min(20vh, 220px)',
  4: 'min(14vh, 160px)',
  5: 'min(11vh, 130px)',
}

const RANK_LABEL = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' }
const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '🏅', 5: '🏅' }

const CONFETTI_COLORS = ['#FF4FA3', '#FFD93D', '#5EE2C1', '#4D7CFF', '#9B6DFF', '#FF7A59']

export default function Podium() {
  const { id } = useParams()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const sizeId = params.get('size') ?? '3'
  const size = SIZES.find(s => s.id === sizeId) ?? SIZES[1]

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

  const ranked = useMemo(
    () => [...teams].sort((a, b) => b.score - a.score).slice(0, size.count),
    [teams, size.count]
  )

  const totalSteps = ranked.length

  useEffect(() => { setStep(0) }, [size.count])

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

  const slotOrder = POSITION_ORDER[ranked.length] ?? Array.from({ length: ranked.length }, (_, i) => i)
  const finished = totalSteps > 0 && step >= totalSteps
  const nextRank = totalSteps - step
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
          <div className="flex gap-1 p-1 rounded-2xl border-2 border-ink bg-white shadow-chunk-sm">
            {SIZES.map(s => (
              <button
                key={s.id}
                onClick={() => { setParams({ size: s.id }); setStep(0) }}
                className={`px-3 py-1.5 rounded-xl font-display font-semibold text-sm transition ${
                  s.id === size.id ? 'bg-candy-pink text-white' : 'text-ink/70 hover:text-ink hover:bg-cream'
                }`}
              >
                {s.label}
              </button>
            ))}
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
          <div className="flex items-end justify-center gap-3 md:gap-6 w-full max-w-6xl">
            {slotOrder.map(i => {
              const team = ranked[i]
              const rank = i + 1
              const revealed = step >= (ranked.length - i)
              return (
                <PodiumSlot
                  key={team.id}
                  team={team}
                  rank={rank}
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
  return `${RANK_LABEL[rank] ?? `${rank}th`} place`
}

function PodiumSlot({ team, rank, revealed, isWinner }) {
  const height = RANK_HEIGHT[rank] ?? RANK_HEIGHT[5]
  const medal = RANK_MEDAL[rank]
  const label = RANK_LABEL[rank]

  const widthClass = isWinner
    ? 'w-32 sm:w-40 md:w-56'
    : rank <= 3
      ? 'w-24 sm:w-32 md:w-44'
      : 'w-20 sm:w-28 md:w-36'

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
