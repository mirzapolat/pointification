import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../lib/auth.jsx'

export default function Login() {
  const { signIn, signUp, session } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (session) nav('/', { replace: true }) }, [session, nav])

  const submit = async (e) => {
    e.preventDefault()
    setErr(null)
    if (mode === 'signup') {
      if (!name.trim()) return setErr('What should we call you?')
      if (password.length < 6) return setErr('Password must be at least 6 characters.')
      if (password !== repeat) return setErr('Passwords don\'t match.')
    }
    setBusy(true)
    if (mode === 'signin') {
      const { error } = await signIn(email, password)
      setBusy(false)
      if (error) setErr(error.message)
    } else {
      const { error } = await signUp(email, password, name)
      setBusy(false)
      if (error) return setErr(error.message)
      nav('/verify', { state: { email, name } })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="h-full bg-cream bg-dots relative overflow-hidden flex flex-col items-center justify-center px-4 py-8"
    >
      <Blobs />

      <motion.div
        initial={{ y: 30, opacity: 0, rotate: -2 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        className="card-chunk relative z-10 w-full max-w-md p-8 mb-6"
      >
        <div className="flex items-center gap-2 mb-6">
          <img src="/pointification.png" alt="Pointification" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="font-display text-3xl font-bold leading-none">Pointification</h1>
            <p className="text-ink/60 text-sm">keep score, beautifully.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6 p-1 rounded-2xl border-2 border-ink bg-cream">
          {['signin', 'signup'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setErr(null) }}
              className={`flex-1 py-2 rounded-xl font-display font-semibold transition ${
                mode === m ? 'bg-ink text-cream' : 'text-ink/70 hover:text-ink'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <AnimatePresence initial={false}>
            {mode === 'signup' && (
              <motion.input
                key="name"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                type="text" required placeholder="your name"
                value={name} onChange={e => setName(e.target.value)}
                className="input-chunk"
              />
            )}
          </AnimatePresence>
          <input
            type="email" required placeholder="you@example.com"
            value={email} onChange={e => setEmail(e.target.value)}
            className="input-chunk"
          />
          <input
            type="password" required minLength={6} placeholder="password (min 6 chars)"
            value={password} onChange={e => setPassword(e.target.value)}
            className="input-chunk"
          />
          <AnimatePresence initial={false}>
            {mode === 'signup' && (
              <motion.input
                key="repeat"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                type="password" required minLength={6} placeholder="repeat password"
                value={repeat} onChange={e => setRepeat(e.target.value)}
                className="input-chunk"
              />
            )}
          </AnimatePresence>
          {err && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="text-sm px-3 py-2 rounded-xl border-2 border-ink bg-candy-yellow/60"
            >{err}</motion.div>
          )}
          <button disabled={busy} className="btn-chunk w-full bg-candy-pink text-white text-lg disabled:opacity-60">
            {busy ? 'one sec…' : mode === 'signin' ? 'Sign in →' : 'Create account →'}
          </button>
        </form>
      </motion.div>

      <motion.nav
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="relative z-10 flex items-center gap-4 text-sm font-semibold text-ink/70"
      >
        <Link to="/imprint" className="hover:text-ink underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink">Imprint</Link>
        <span aria-hidden className="text-ink/30">·</span>
        <Link to="/privacy" className="hover:text-ink underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink">Privacy</Link>
      </motion.nav>
    </motion.div>
  )
}

function Blobs() {
  const blobs = [
    { c: '#FF4FA3', x: '8%',  y: '12%', s: 180 },
    { c: '#FFD93D', x: '78%', y: '18%', s: 220 },
    { c: '#5EE2C1', x: '12%', y: '72%', s: 260 },
    { c: '#4D7CFF', x: '82%', y: '70%', s: 200 }
  ]
  return blobs.map((b, i) => (
    <motion.div
      key={i}
      className="absolute rounded-full border-2 border-ink"
      style={{ left: b.x, top: b.y, width: b.s, height: b.s, background: b.c }}
      animate={{ y: [0, -16, 0], rotate: [0, 6, 0] }}
      transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
    />
  ))
}
