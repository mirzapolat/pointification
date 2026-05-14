import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useDialogs } from '../components/Dialogs.jsx'

export default function Account() {
  const { user, signOut } = useAuth()
  const nav = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full bg-cream bg-grid"
    >
      <header className="px-6 md:px-10 py-6 flex items-center justify-between border-b-2 border-ink bg-cream/80 backdrop-blur sticky top-0 z-20">
        <Link to="/" className="btn-chunk bg-white text-sm py-2 px-3">← Games</Link>
        <h1 className="font-display font-bold text-2xl">Account</h1>
        <div className="w-[88px]" />
      </header>

      <main className="max-w-2xl mx-auto px-6 md:px-10 py-10 space-y-6">
        <div>
          <h2 className="font-display text-5xl font-bold tracking-tight">
            <span className="text-rainbow">Account</span> settings.
          </h2>
          <p className="text-ink/60 mt-2 break-all">Signed in as <span className="font-semibold">{user?.email}</span></p>
        </div>

        <EmailCard currentEmail={user?.email} />
        <PasswordCard />
        <DangerCard onDeleted={async () => { await signOut(); nav('/login', { replace: true }) }} />
      </main>
    </motion.div>
  )
}

function Section({ title, accent, children }) {
  return (
    <motion.section
      layout
      initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      className="card-chunk overflow-hidden"
    >
      <div className="px-6 py-4 border-b-2 border-ink" style={{ background: accent }}>
        <h3 className="font-display text-2xl font-bold">{title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </motion.section>
  )
}

function Banner({ kind, children }) {
  if (!children) return null
  const bg = kind === 'error' ? 'bg-candy-pink/30' : 'bg-candy-mint/50'
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className={`mt-3 px-3 py-2 rounded-xl border-2 border-ink text-sm ${bg}`}
    >{children}</motion.div>
  )
}

function EmailCard({ currentEmail }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setMsg(null)
    if (!email || email === currentEmail) return setErr('Pick a different email.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ email })
    setBusy(false)
    if (error) setErr(error.message)
    else setMsg('Check both your old and new inbox to confirm the change.')
  }

  return (
    <Section title="Email" accent="#FFD93D">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder={currentEmail ?? 'new@email.com'}
          className="input-chunk flex-1"
        />
        <button disabled={busy} className="btn-chunk bg-candy-mint disabled:opacity-60">
          {busy ? 'Updating…' : 'Update email'}
        </button>
      </form>
      <Banner kind="error">{err}</Banner>
      <Banner kind="ok">{msg}</Banner>
      <p className="text-xs text-ink/60 mt-3">
        Supabase sends a confirmation link to the new address before the change takes effect.
      </p>
    </Section>
  )
}

function PasswordCard() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setMsg(null)
    if (next.length < 6) return setErr('New password must be at least 6 characters.')
    if (next !== confirm) return setErr('New passwords don\'t match.')

    setBusy(true)
    // Re-verify current password by attempting a sign-in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email, password: current
    })
    if (verifyError) {
      setBusy(false)
      return setErr('Current password is incorrect.')
    }
    const { error } = await supabase.auth.updateUser({ password: next })
    setBusy(false)
    if (error) setErr(error.message)
    else {
      setMsg('Password updated.')
      setCurrent(''); setNext(''); setConfirm('')
    }
  }

  return (
    <Section title="Password" accent="#5EE2C1">
      <form onSubmit={submit} className="space-y-2">
        <input
          type="password" required placeholder="current password"
          value={current} onChange={e => setCurrent(e.target.value)}
          className="input-chunk"
        />
        <input
          type="password" required minLength={6} placeholder="new password (min 6 chars)"
          value={next} onChange={e => setNext(e.target.value)}
          className="input-chunk"
        />
        <input
          type="password" required placeholder="confirm new password"
          value={confirm} onChange={e => setConfirm(e.target.value)}
          className="input-chunk"
        />
        <button disabled={busy} className="btn-chunk bg-candy-mint w-full disabled:opacity-60">
          {busy ? 'Updating…' : 'Change password'}
        </button>
      </form>
      <Banner kind="error">{err}</Banner>
      <Banner kind="ok">{msg}</Banner>
    </Section>
  )
}

function DangerCard({ onDeleted }) {
  const { user } = useAuth()
  const [confirmText, setConfirmText] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const expected = user?.email ?? ''
  const canDelete = confirmText.trim().toLowerCase() === expected.toLowerCase()

  const dialogs = useDialogs()
  const submit = async () => {
    setErr(null)
    if (!canDelete) return
    const ok = await dialogs.confirm({
      title: 'Delete account permanently?',
      message: `${expected} and every game you own will be erased. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('delete_my_account')
    setBusy(false)
    if (error) setErr(error.message)
    else onDeleted()
  }

  return (
    <Section title="Danger zone" accent="#FF4FA3">
      <p className="text-sm">
        Permanently delete your account. Games you own (and their teams, scores, and logs) will be deleted.
        Games shared <em>with</em> you stay with their owners.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="btn-chunk bg-candy-pink text-white mt-4"
        >Delete my account…</button>
      ) : (
        <div className="mt-4 space-y-2">
          <label className="text-sm">
            Type <span className="font-semibold break-all">{expected}</span> to confirm.
          </label>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={expected}
            className="input-chunk"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setOpen(false); setConfirmText(''); setErr(null) }}
              className="btn-chunk bg-white flex-1"
            >Cancel</button>
            <button
              onClick={submit}
              disabled={!canDelete || busy}
              className="btn-chunk bg-candy-pink text-white flex-1 disabled:opacity-50"
            >{busy ? 'Deleting…' : 'Permanently delete'}</button>
          </div>
          <Banner kind="error">{err}</Banner>
        </div>
      )}
    </Section>
  )
}
