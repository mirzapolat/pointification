import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../lib/auth.jsx'
import { track } from '../lib/analytics.js'
import { passkeysSupported } from '../lib/passkeys.js'

export default function Login() {
  const {
    signIn, signUp, signOut, user, mfaRequired, mfaMethods,
    verifyMfaCode, verifyMfaPasskey, signInWithPasskey,
  } = useAuth()
  const canPasskey = passkeysSupported()
  const nav = useNavigate()
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user && !mfaRequired) nav('/', { replace: true })
  }, [user, mfaRequired, nav])

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
      track('signup')
      nav('/verify', { state: { email, name } })
    }
  }

  const passkeySignIn = async () => {
    setErr(null)
    setBusy(true)
    const { error } = await signInWithPasskey()
    setBusy(false)
    if (error) setErr(error.message)
    else track('passkey-signin')
  }

  const showMfa = user && mfaRequired

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

        {showMfa ? (
          <MfaChallenge
            methods={mfaMethods ?? { totp: true, passkey: false }}
            canPasskey={canPasskey}
            onSubmit={verifyMfaCode}
            onPasskey={verifyMfaPasskey}
            onCancel={async () => { await signOut() }}
          />
        ) : (
          <>
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

            {mode === 'signin' && canPasskey && (
              <>
                <Divider />
                <button
                  type="button"
                  onClick={passkeySignIn}
                  disabled={busy}
                  className="btn-chunk w-full bg-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <KeyIcon />
                  Sign in with a passkey
                </button>
              </>
            )}
          </>
        )}
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

function MfaChallenge({ methods, canPasskey, onSubmit, onPasskey, onCancel }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const offerPasskey = methods.passkey && canPasskey

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    const { error } = await onSubmit(code.trim())
    setBusy(false)
    if (error) setErr(error.message)
  }

  const usePasskey = async () => {
    setErr(null); setBusy(true)
    const { error } = await onPasskey()
    setBusy(false)
    if (error) setErr(error.message)
  }

  return (
    <div>
      <div className="mb-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink/60">Two-factor auth</div>
        <h2 className="font-display font-bold text-2xl">
          {methods.totp ? 'Enter your code' : 'Confirm with your passkey'}
        </h2>
        <p className="text-sm text-ink/70 mt-1">
          {methods.totp
            ? 'Open your authenticator app and enter the 6-digit code for Pointification.'
            : 'Use the passkey saved on your device to finish signing in.'}
          {methods.totp && offerPasskey && ' Or use your passkey instead.'}
        </p>
      </div>
      <div className="space-y-3">
        {offerPasskey && (
          <button
            type="button"
            onClick={usePasskey}
            disabled={busy}
            autoFocus={!methods.totp}
            className={`btn-chunk w-full inline-flex items-center justify-center gap-2 disabled:opacity-60 ${
              methods.totp ? 'bg-white' : 'bg-candy-pink text-white text-lg'
            }`}
          >
            <KeyIcon />
            {busy && !methods.totp ? 'waiting for passkey…' : 'Use passkey'}
          </button>
        )}
        {methods.passkey && !canPasskey && !methods.totp && (
          <div className="text-sm px-3 py-2 rounded-xl border-2 border-ink bg-candy-yellow/60">
            This browser can't use passkeys. Try another browser or device.
          </div>
        )}
        {offerPasskey && methods.totp && <Divider />}
        {methods.totp && (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="input-chunk font-mono tracking-[0.4em] text-center text-xl"
              aria-label="6-digit code"
            />
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="btn-chunk w-full bg-candy-pink text-white text-lg disabled:opacity-60"
            >
              {busy ? 'verifying…' : 'Verify →'}
            </button>
          </form>
        )}
        {err && (
          <div className="text-sm px-3 py-2 rounded-xl border-2 border-ink bg-candy-yellow/60">{err}</div>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-chunk w-full bg-white disabled:opacity-60"
        >
          Cancel & sign out
        </button>
      </div>
    </div>
  )
}

function Divider() {
  return (
    <div className="flex items-center gap-3 my-4 text-xs font-bold uppercase tracking-wider text-ink/50">
      <span className="flex-1 h-0.5 bg-ink/15" />
      or
      <span className="flex-1 h-0.5 bg-ink/15" />
    </div>
  )
}

function KeyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 21 2" />
      <path d="m16 7 3 3" />
      <path d="m19 4 2 2" />
    </svg>
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
