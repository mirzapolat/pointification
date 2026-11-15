import { useState } from 'react'
import { motion } from 'framer-motion'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth.jsx'

/**
 * Every account needs a name: collaborators and share-link viewers see it in
 * the log instead of an email. Accounts created before that rule land here
 * once, before anything else in the app.
 */
export default function SetName() {
  const { refresh, signOut, user } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    const next = name.trim()
    if (!next) return setErr('What should we call you?')
    setBusy(true); setErr(null)
    const { error } = await api.updateAccount({ display_name: next })
    if (error) { setBusy(false); return setErr(error.message) }
    await refresh()
  }

  return (
    <div className="min-h-full bg-cream bg-dots flex items-center justify-center px-4 pt-10 pb-safe [--pb:2.5rem]">
      <motion.form
        onSubmit={submit}
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 16 }}
        className="card-chunk w-full max-w-md p-6 md:p-8"
      >
        <div className="w-12 h-12 rounded-2xl border-2 border-ink bg-candy-yellow grid place-items-center text-2xl mb-4" aria-hidden="true">👋</div>
        <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight">What's your name?</h1>
        <p className="text-sm text-ink/60 mt-1 mb-5">
          It shows up next to the points you add, so your co-scorekeepers know who did what.
          Public logs only ever show your name, never your email.
        </p>
        <input
          type="text"
          autoFocus
          required
          maxLength={60}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="your name"
          autoComplete="name"
          className="input-chunk"
        />
        {err && <div className="mt-3 px-3 py-2 rounded-xl border-2 border-ink bg-candy-pink/30 text-sm">{err}</div>}
        <button disabled={busy} className="btn-chunk w-full bg-candy-pink text-white text-lg mt-4 disabled:opacity-60">
          {busy ? 'Saving…' : 'Continue →'}
        </button>
        <button type="button" onClick={signOut} className="block mx-auto mt-4 text-xs font-semibold text-ink/50 hover:text-ink">
          Not {user?.email}? Sign out
        </button>
      </motion.form>
    </div>
  )
}
