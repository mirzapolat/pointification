import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'

const ROLES = [
  'Teacher / Educator',
  'Game master',
  'Coach / Trainer',
  'Manager / Team lead',
  'Friend or family',
  'Student',
  'Just curious',
  'Other'
]

const USES = [
  'Classroom games & quizzes',
  'Game nights with friends',
  'Family fun',
  'Sports & training',
  'Workshops & icebreakers',
  'Streaming or events',
  'Something else'
]

export default function Welcome() {
  const { user, refreshDetails } = useAuth()
  const nav = useNavigate()
  const [organization, setOrganization] = useState('')
  const [role, setRole] = useState('')
  const [intendedUse, setIntendedUse] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async () => {
    if (!user) return
    setBusy(true); setErr(null)
    const { error } = await supabase
      .from('user_details')
      .upsert({
        id: user.id,
        organization: organization.trim() || null,
        role: role || null,
        intended_use: intendedUse || null,
        details_completed_at: new Date().toISOString()
      })
    setBusy(false)
    if (error) return setErr(error.message)
    await refreshDetails()
    nav('/onboarding', { replace: true })
  }

  const skip = async () => {
    if (!user) return
    setBusy(true); setErr(null)
    const { error } = await supabase
      .from('user_details')
      .upsert({ id: user.id, details_completed_at: new Date().toISOString() })
    setBusy(false)
    if (error) return setErr(error.message)
    await refreshDetails()
    nav('/onboarding', { replace: true })
  }

  const displayName = user?.user_metadata?.display_name

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full bg-cream bg-dots relative overflow-hidden flex flex-col items-center justify-center px-4 py-10"
    >
      <Blobs />

      <motion.div
        initial={{ y: 30, opacity: 0, rotate: -1 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        className="card-chunk relative z-10 w-full max-w-lg p-8"
      >
        <div className="flex items-center gap-3 mb-5">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5 }}
            className="w-12 h-12 rounded-2xl border-2 border-ink bg-candy-mint grid place-items-center text-2xl"
          >
            👋
          </motion.div>
          <div>
            <h1 className="font-display text-3xl font-bold leading-tight">
              Hey{displayName ? `, ${displayName}` : ''}!
            </h1>
            <p className="text-sm text-ink/60">Tell us a tiny bit about you — all optional.</p>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="Organization (optional)" hint="Your school, company, club — anything.">
            <input
              type="text"
              value={organization}
              onChange={e => setOrganization(e.target.value)}
              placeholder="e.g. Springfield High"
              className="input-chunk"
            />
          </Field>

          <Field label="What's your role?" hint="Pick the closest match.">
            <Select value={role} onChange={setRole} options={ROLES} placeholder="Select a role…" />
          </Field>

          <Field label="What will you use Pointification for?" hint="Helps us make it better for you.">
            <Select value={intendedUse} onChange={setIntendedUse} options={USES} placeholder="Select a use case…" />
          </Field>
        </div>

        {err && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="text-sm px-3 py-2 rounded-xl border-2 border-ink bg-candy-pink/30 mt-4"
          >{err}</motion.div>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={skip} disabled={busy} className="btn-chunk bg-white flex-1 disabled:opacity-50">
            Skip
          </button>
          <button onClick={submit} disabled={busy} className="btn-chunk bg-candy-pink text-white flex-1 text-lg disabled:opacity-50">
            {busy ? 'saving…' : 'Continue →'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold">{label}</label>
      {hint && <p className="text-xs text-ink/60 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-chunk appearance-none pr-10 cursor-pointer"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <svg
        aria-hidden
        className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  )
}

function Blobs() {
  const blobs = [
    { c: '#5EE2C1', x: '4%',  y: '10%', s: 220 },
    { c: '#FFD93D', x: '82%', y: '12%', s: 180 },
    { c: '#FF4FA3', x: '12%', y: '74%', s: 200 },
    { c: '#9B6DFF', x: '78%', y: '70%', s: 220 }
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
