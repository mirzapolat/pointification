import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth.jsx'

const CODE_LEN = 6

export default function Verify() {
  const { verifySignupOtp, resendSignupOtp, session } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const email = loc.state?.email ?? ''
  const [digits, setDigits] = useState(() => Array(CODE_LEN).fill(''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [resentAt, setResentAt] = useState(null)
  const [resending, setResending] = useState(false)
  const inputs = useRef([])

  useEffect(() => {
    if (!email) nav('/login', { replace: true })
  }, [email, nav])

  useEffect(() => {
    if (session) nav('/', { replace: true })
  }, [session, nav])

  useEffect(() => { inputs.current[0]?.focus() }, [])

  const setDigit = (i, v) => {
    setDigits(d => {
      const next = d.slice()
      next[i] = v
      return next
    })
  }

  const handleChange = (i, raw) => {
    const v = raw.replace(/\D/g, '')
    if (!v) { setDigit(i, ''); return }
    if (v.length === 1) {
      setDigit(i, v)
      if (i < CODE_LEN - 1) inputs.current[i + 1]?.focus()
    } else {
      // pasted multiple digits into one input
      const chars = v.slice(0, CODE_LEN - i).split('')
      setDigits(d => {
        const next = d.slice()
        chars.forEach((c, k) => { next[i + k] = c })
        return next
      })
      const last = Math.min(i + chars.length, CODE_LEN - 1)
      inputs.current[last]?.focus()
    }
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        setDigit(i, '')
      } else if (i > 0) {
        inputs.current[i - 1]?.focus()
        setDigit(i - 1, '')
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      inputs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight' && i < CODE_LEN - 1) {
      inputs.current[i + 1]?.focus()
    } else if (e.key === 'Enter') {
      submit()
    }
  }

  const handlePaste = (e) => {
    const text = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, CODE_LEN)
    if (!text) return
    e.preventDefault()
    const next = Array(CODE_LEN).fill('')
    for (let k = 0; k < text.length; k++) next[k] = text[k]
    setDigits(next)
    const last = Math.min(text.length, CODE_LEN) - 1
    inputs.current[Math.max(last, 0)]?.focus()
  }

  const submit = async () => {
    const token = digits.join('')
    if (token.length !== CODE_LEN) return setErr('Enter the 6-digit code.')
    setBusy(true); setErr(null)
    const { error } = await verifySignupOtp(email, token)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    nav('/welcome', { replace: true })
  }

  const resend = async () => {
    setResending(true); setErr(null)
    const { error } = await resendSignupOtp(email)
    setResending(false)
    if (error) setErr(error.message)
    else setResentAt(Date.now())
  }

  const filled = digits.filter(Boolean).length
  const complete = filled === CODE_LEN

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="h-full bg-cream bg-dots relative overflow-hidden flex flex-col items-center justify-center px-4 py-8"
    >
      <Blobs />

      <motion.div
        initial={{ y: 30, opacity: 0, rotate: -1 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        className="card-chunk relative z-10 w-full max-w-md p-8"
      >
        <div className="flex items-center gap-3 mb-5">
          <motion.div
            animate={{ rotate: [0, -8, 8, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5 }}
            className="w-12 h-12 rounded-2xl border-2 border-ink bg-candy-yellow grid place-items-center text-2xl"
          >
            ✉️
          </motion.div>
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight">Check your inbox</h1>
            <p className="text-sm text-ink/60">
              We sent a 6-digit code to <span className="font-semibold break-all">{email}</span>.
            </p>
          </div>
        </div>

        <p className="text-sm text-ink/70 mb-5">
          Enter it below or click the link in the email — either works.
        </p>

        <div className="flex justify-between gap-2 mb-2" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <motion.input
              key={i}
              ref={el => (inputs.current[i] = el)}
              value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              onFocus={e => e.target.select()}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={CODE_LEN}
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${i + 1}`}
              animate={d ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`w-11 h-14 md:w-12 md:h-16 text-center font-display text-3xl font-bold rounded-2xl border-2 border-ink bg-white outline-none focus:shadow-chunk-sm focus:-translate-y-0.5 transition-all ${d ? 'bg-candy-mint/40' : ''}`}
            />
          ))}
        </div>

        {err && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="text-sm px-3 py-2 rounded-xl border-2 border-ink bg-candy-pink/30 mt-3"
          >{err}</motion.div>
        )}

        {resentAt && !err && (
          <motion.div
            key={resentAt}
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="text-sm px-3 py-2 rounded-xl border-2 border-ink bg-candy-mint/50 mt-3"
          >New code sent. Check your inbox.</motion.div>
        )}

        <button
          onClick={submit}
          disabled={!complete || busy}
          className="btn-chunk w-full bg-candy-pink text-white text-lg disabled:opacity-50 mt-4"
        >
          {busy ? 'verifying…' : 'Verify code →'}
        </button>

        <div className="flex items-center justify-between mt-5 text-sm">
          <button
            onClick={resend}
            disabled={resending}
            className="font-semibold text-ink/70 hover:text-ink underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink disabled:opacity-50"
          >
            {resending ? 'sending…' : 'Resend code'}
          </button>
          <Link
            to="/login"
            className="font-semibold text-ink/70 hover:text-ink underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink"
          >
            Use a different email
          </Link>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Blobs() {
  const blobs = [
    { c: '#FFD93D', x: '6%',  y: '10%', s: 200 },
    { c: '#5EE2C1', x: '80%', y: '16%', s: 180 },
    { c: '#FF4FA3', x: '10%', y: '74%', s: 220 },
    { c: '#9B6DFF', x: '78%', y: '68%', s: 200 }
  ]
  return blobs.map((b, i) => (
    <motion.div
      key={i}
      aria-hidden
      className="absolute rounded-full border-2 border-ink opacity-70"
      style={{ left: b.x, top: b.y, width: b.s, height: b.s, background: b.c }}
      animate={{ y: [0, -14, 0], rotate: [0, 5, 0] }}
      transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
    />
  ))
}
