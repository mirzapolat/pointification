import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

const FEATURES = [
  {
    color: 'bg-candy-pink',
    title: 'Live scores',
    body: 'Tap to add or subtract points. Animations and confetti included.',
    icon: '🎯',
  },
  {
    color: 'bg-candy-yellow',
    title: 'Share a link',
    body: 'Friends and family can watch the scoreboard live — no account needed.',
    icon: '🔗',
  },
  {
    color: 'bg-candy-mint',
    title: 'Play together',
    body: 'Invite collaborators by email so anyone at the table can keep score.',
    icon: '🤝',
  },
  {
    color: 'bg-candy-blue',
    title: 'Full history',
    body: 'Every point is logged. Scroll back to settle any debate.',
    icon: '📜',
  },
]

export default function Landing() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full bg-cream bg-grid relative overflow-hidden"
    >
      <Blobs />
      <Header />

      <main className="relative z-10 max-w-6xl mx-auto px-4 md:px-10 pt-10 md:pt-20 pb-20">
        <Hero />
        <Features />
        <HowItWorks />
        <CTA />
      </main>

      <Footer />
    </motion.div>
  )
}

function Header() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const links = [
    { to: '#features', label: 'Features' },
    { to: '#how', label: 'How it works' },
  ]

  return (
    <header className="relative z-30 px-4 md:px-10 py-4 md:py-6 flex items-center justify-between gap-3 border-b-2 border-ink bg-cream/80 backdrop-blur sticky top-0">
      <Link to="/" className="flex items-center gap-2.5 md:gap-3 min-w-0">
        <img src="/pointification.png" alt="Pointification" className="w-9 h-9 md:w-10 md:h-10 object-contain shrink-0" />
        <h1 className="font-display font-bold text-xl md:text-2xl leading-none">Pointification</h1>
      </Link>

      <nav className="hidden md:flex items-center gap-1">
        {links.map(l => (
          <a key={l.to} href={l.to}
            className="px-3 py-2 rounded-xl font-semibold text-ink/70 hover:text-ink hover:bg-white/60 transition">
            {l.label}
          </a>
        ))}
        <Link to="/login" className="ml-2 btn-chunk bg-white text-sm py-2">Sign in</Link>
        <Link to="/login" className="btn-chunk bg-candy-pink text-white text-sm py-2">Get started →</Link>
      </nav>

      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="md:hidden w-10 h-10 rounded-xl border-2 border-ink bg-white grid place-items-center"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {open
            ? <><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>
            : <><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></>}
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="md:hidden fixed inset-0 top-[65px] bg-ink/30 backdrop-blur-sm z-20"
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="md:hidden absolute left-3 right-3 top-[calc(100%+8px)] z-30 card-chunk p-3 flex flex-col gap-1"
            >
              {links.map(l => (
                <a
                  key={l.to}
                  href={l.to}
                  onClick={() => setOpen(false)}
                  className="px-4 py-3 rounded-2xl font-display font-semibold hover:bg-candy-yellow/60 transition"
                >
                  {l.label}
                </a>
              ))}
              <div className="h-[2px] bg-ink/10 my-1" />
              <Link to="/login" onClick={() => setOpen(false)} className="btn-chunk bg-white w-full">Sign in</Link>
              <Link to="/login" onClick={() => setOpen(false)} className="btn-chunk bg-candy-pink text-white w-full">Get started →</Link>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  )
}

function Hero() {
  return (
    <section className="text-center max-w-3xl mx-auto">
      <motion.div
        initial={{ scale: 0.9, opacity: 0, rotate: -3 }}
        animate={{ scale: 1, opacity: 1, rotate: -2 }}
        transition={{ type: 'spring', stiffness: 160, damping: 14 }}
        className="inline-block px-4 py-1.5 rounded-full border-2 border-ink bg-white shadow-chunk-sm text-sm font-semibold mb-6"
      >
        🎲 keep score, beautifully
      </motion.div>

      <motion.h2
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="font-display font-bold text-5xl md:text-7xl leading-[1.05] tracking-tight"
      >
        The scoreboard for{' '}
        <span className="text-rainbow">game night.</span>
      </motion.h2>

      <motion.p
        initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="mt-5 text-lg md:text-xl text-ink/70 max-w-xl mx-auto"
      >
        Track points for quizzes, board games, and tournaments. Share a link,
        play together, never argue about the score again.
      </motion.p>

      <motion.div
        initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
      >
        <Link to="/login" className="btn-chunk bg-candy-pink text-white text-lg w-full sm:w-auto">
          Start a game →
        </Link>
        <a href="#features" className="btn-chunk bg-white text-lg w-full sm:w-auto">
          See features
        </a>
      </motion.div>

      <ScoreMock />
    </section>
  )
}

function ScoreMock() {
  const teams = [
    { name: 'Pink Pandas',  color: '#FF4FA3', score: 42, tilt: -2 },
    { name: 'Mint Tigers',  color: '#5EE2C1', score: 38, tilt: 1.5 },
    { name: 'Yellow Yetis', color: '#FFD93D', score: 29, tilt: -1 },
  ]
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.4, type: 'spring', stiffness: 120, damping: 18 }}
      className="mt-14 md:mt-20 grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 max-w-3xl mx-auto"
    >
      {teams.map((t, i) => (
        <motion.div
          key={t.name}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
          style={{ rotate: `${t.tilt}deg`, background: t.color }}
          className="card-chunk overflow-hidden p-5 text-left"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-ink/70">team {i + 1}</div>
          <div className="font-display font-bold text-xl mt-0.5 truncate">{t.name}</div>
          <div className="font-display font-bold text-6xl mt-3 leading-none">{t.score}</div>
        </motion.div>
      ))}
    </motion.div>
  )
}

function Features() {
  return (
    <section id="features" className="mt-24 md:mt-32 scroll-mt-24">
      <div className="text-center mb-10 md:mb-14">
        <h3 className="font-display font-bold text-3xl md:text-5xl">Made for messy, loud rounds.</h3>
        <p className="text-ink/60 mt-3 max-w-xl mx-auto">Everything you need to run a game, nothing you don't.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ y: 24, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ delay: i * 0.05, type: 'spring', stiffness: 180, damping: 20 }}
            whileHover={{ y: -4, rotate: -0.5 }}
            className="card-chunk p-6 md:p-7 flex items-start gap-4"
          >
            <div className={`shrink-0 w-12 h-12 rounded-2xl border-2 border-ink grid place-items-center text-2xl ${f.color}`}>
              {f.icon}
            </div>
            <div>
              <h4 className="font-display font-bold text-xl">{f.title}</h4>
              <p className="text-ink/70 mt-1">{f.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { n: 1, title: 'Create a game',    body: 'Name it, add teams, pick colors.' },
    { n: 2, title: 'Tap to score',     body: 'Add or subtract points in a single tap.' },
    { n: 3, title: 'Share or invite',  body: 'Send a public link or invite collaborators.' },
  ]
  return (
    <section id="how" className="mt-24 md:mt-32 scroll-mt-24">
      <div className="text-center mb-10 md:mb-14">
        <h3 className="font-display font-bold text-3xl md:text-5xl">Three steps. That's it.</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {steps.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ delay: i * 0.08 }}
            className="card-chunk p-6 md:p-7 relative"
          >
            <div className="absolute -top-4 -left-4 w-12 h-12 rounded-2xl border-2 border-ink bg-ink text-cream font-display font-bold text-2xl grid place-items-center shadow-chunk-sm">
              {s.n}
            </div>
            <h4 className="font-display font-bold text-xl mt-3">{s.title}</h4>
            <p className="text-ink/70 mt-1">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function CTA() {
  return (
    <section className="mt-24 md:mt-32">
      <motion.div
        initial={{ rotate: -1, scale: 0.96, opacity: 0 }}
        whileInView={{ rotate: -1, scale: 1, opacity: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ type: 'spring', stiffness: 140, damping: 16 }}
        className="card-chunk bg-candy-mint p-8 md:p-12 text-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-dots opacity-20 pointer-events-none" />
        <h3 className="relative font-display font-bold text-3xl md:text-5xl">Ready to keep score?</h3>
        <p className="relative text-ink/70 mt-3 max-w-md mx-auto">
          It's free. Make an account, spin up a game, and start tapping.
        </p>
        <div className="relative mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/login" className="btn-chunk bg-candy-pink text-white text-lg w-full sm:w-auto">
            Create an account →
          </Link>
          <Link to="/login" className="btn-chunk bg-white text-lg w-full sm:w-auto">
            I already have one
          </Link>
        </div>
      </motion.div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="relative z-10 border-t-2 border-ink bg-cream/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 md:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <img src="/pointification.png" alt="" className="w-6 h-6 object-contain" />
          <span className="font-semibold">Pointification</span>
          <span className="text-ink/40">·</span>
          <span className="text-ink/60">made for game night</span>
        </div>
        <nav className="flex items-center gap-4 font-semibold text-ink/70">
          <Link to="/imprint" className="hover:text-ink underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink">Imprint</Link>
          <span aria-hidden className="text-ink/30">·</span>
          <Link to="/privacy" className="hover:text-ink underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink">Privacy</Link>
        </nav>
      </div>
    </footer>
  )
}

function Blobs() {
  const blobs = [
    { c: '#FF4FA3', x: '-4%',  y: '8%',   s: 200 },
    { c: '#FFD93D', x: '88%',  y: '6%',   s: 160 },
    { c: '#5EE2C1', x: '-6%',  y: '60%',  s: 240 },
    { c: '#9B6DFF', x: '85%',  y: '55%',  s: 180 },
  ]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2 border-ink opacity-60"
          style={{ left: b.x, top: b.y, width: b.s, height: b.s, background: b.c }}
          animate={{ y: [0, -16, 0], rotate: [0, 6, 0] }}
          transition={{ duration: 7 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
        />
      ))}
    </div>
  )
}
