import { useEffect, useState } from 'react'
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
        <NameCard />
        <EmailCard currentEmail={user?.email} />
        <PasswordCard />
        <TwoFactorCard />
        <PrivacyCard />
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

function NameCard() {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [original, setOriginal] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('profiles')
        .select('display_name').eq('id', user.id).maybeSingle()
      if (cancelled) return
      const v = data?.display_name ?? user.user_metadata?.display_name ?? ''
      setName(v)
      setOriginal(v)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [user.id])

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setMsg(null)
    const next = name.trim()
    if (!next) return setErr('Name can\'t be empty.')
    if (next === original) return setErr('Pick a different name.')

    setBusy(true)
    const { error: metaErr } = await supabase.auth.updateUser({ data: { display_name: next } })
    if (metaErr) { setBusy(false); return setErr(metaErr.message) }
    const { error: profErr } = await supabase.from('profiles')
      .update({ display_name: next }).eq('id', user.id)
    setBusy(false)
    if (profErr) return setErr(profErr.message)
    setOriginal(next)
    setMsg('Name updated.')
  }

  return (
    <Section title="Name" accent="#5EE2C1">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text" required
          value={name} onChange={e => setName(e.target.value)}
          disabled={!loaded}
          placeholder="your name"
          className="input-chunk flex-1"
        />
        <button disabled={busy || !loaded} className="btn-chunk bg-candy-mint disabled:opacity-60">
          {busy ? 'Updating…' : 'Update name'}
        </button>
      </form>
      <Banner kind="error">{err}</Banner>
      <Banner kind="ok">{msg}</Banner>
    </Section>
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
    const { error } = await supabase.rpc('change_my_email', { p_email: email })
    setBusy(false)
    if (error) setErr(error.message)
    else { setMsg('Email updated.'); setEmail('') }
  }

  return (
    <Section title="Email" accent="#FFD93D">
      <p className="text-sm text-ink/60 mb-3">Signed in as <span className="font-semibold break-all">{currentEmail}</span></p>
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
    </Section>
  )
}

function PrivacyCard() {
  const { user } = useAuth()
  const [allowInvites, setAllowInvites] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('profiles')
        .select('allow_invites').eq('id', user.id).single()
      if (!cancelled) {
        if (data) setAllowInvites(data.allow_invites)
        setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [user.id])

  const toggle = async () => {
    if (busy) return
    const next = !allowInvites
    setAllowInvites(next)
    setBusy(true); setErr(null)
    const { error } = await supabase.from('profiles')
      .update({ allow_invites: next }).eq('id', user.id)
    setBusy(false)
    if (error) {
      setAllowInvites(!next)
      setErr(error.message)
    }
  }

  return (
    <Section title="Privacy" accent="#9B6DFF">
      <div className="flex items-center justify-between gap-4">
        <div>
          <label className="block text-sm font-semibold">Allow others to add me to games</label>
          <p className="text-xs text-ink/60">When off, no one can invite you as a collaborator.</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={!loaded || busy}
          aria-pressed={allowInvites}
          className={`relative w-14 h-8 rounded-full border-2 border-ink transition-colors disabled:opacity-60 shrink-0 ${allowInvites ? 'bg-candy-mint' : 'bg-white'}`}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-0.5 w-6 h-6 rounded-full bg-ink"
            style={{ left: allowInvites ? 'calc(100% - 26px)' : '2px' }}
          />
        </button>
      </div>
      <Banner kind="error">{err}</Banner>
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

function TwoFactorCard() {
  const { refreshAal } = useAuth()
  const [factors, setFactors] = useState(null)
  const [enrolling, setEnrolling] = useState(null)
  const [disablingId, setDisablingId] = useState(null)
  const [code, setCode] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = async () => {
    setErr(null)
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) { setErr(error.message); setFactors([]); return }
    setFactors(data?.totp ?? [])
  }

  useEffect(() => { load() }, [])

  const verified = (factors ?? []).filter(f => f.status === 'verified')
  const enabled = verified.length > 0

  const startEnroll = async () => {
    setErr(null); setMsg(null); setBusy(true)
    try {
      for (const f of (factors ?? []).filter(f => f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const friendlyName = `Pointification ${new Date().toISOString().slice(0, 10)}`
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName })
      if (error) { setErr(error.message); return }
      setEnrolling({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      })
      setCode('')
      setShowSecret(false)
    } finally {
      setBusy(false)
    }
  }

  const cancelEnroll = async () => {
    if (!enrolling) return
    setBusy(true)
    try { await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId }) } catch {/* noop */}
    setBusy(false)
    setEnrolling(null)
    setCode('')
    setErr(null)
  }

  const finishEnroll = async (e) => {
    e.preventDefault()
    if (!enrolling) return
    setErr(null); setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolling.factorId,
      code: code.trim(),
    })
    setBusy(false)
    if (error) return setErr(error.message)
    setEnrolling(null)
    setCode('')
    setMsg('Two-factor authentication is on.')
    await load()
    await refreshAal()
  }

  const startDisable = (id) => {
    setDisablingId(id)
    setCode('')
    setErr(null); setMsg(null)
  }

  const cancelDisable = () => {
    setDisablingId(null)
    setCode('')
    setErr(null)
  }

  const finishDisable = async (e) => {
    e.preventDefault()
    if (!disablingId) return
    setErr(null); setBusy(true)
    const { error: vErr } = await supabase.auth.mfa.challengeAndVerify({
      factorId: disablingId,
      code: code.trim(),
    })
    if (vErr) { setBusy(false); return setErr(vErr.message) }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: disablingId })
    setBusy(false)
    if (error) return setErr(error.message)
    setDisablingId(null)
    setCode('')
    setMsg('Two-factor authentication turned off.')
    await load()
    await refreshAal()
  }

  return (
    <Section title="Two-factor auth" accent="#4D7CFF">
      {factors === null ? (
        <div className="text-sm text-ink/60">Loading…</div>
      ) : enrolling ? (
        <form onSubmit={finishEnroll} className="space-y-4">
          <ol className="text-sm space-y-1 list-decimal pl-5 text-ink/80">
            <li>Open an authenticator app (Google Authenticator, 1Password, Authy, etc.).</li>
            <li>Scan the QR code below or paste the setup key into your app.</li>
            <li>Enter the 6-digit code your app shows to finish.</li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="w-44 h-44 rounded-2xl border-2 border-ink bg-white p-2 grid place-items-center shrink-0">
              <img src={enrolling.qrCode} alt="2FA QR code" className="w-full h-full" />
            </div>
            <div className="flex-1 min-w-0 w-full">
              <button
                type="button"
                onClick={() => setShowSecret(s => !s)}
                className="text-xs font-semibold underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink"
              >
                {showSecret ? 'Hide setup key' : 'Can\'t scan? Show setup key'}
              </button>
              {showSecret && (
                <div className="mt-2 px-3 py-2 rounded-xl border-2 border-ink bg-cream font-mono text-xs break-all select-all">
                  {enrolling.secret}
                </div>
              )}
            </div>
          </div>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456" autoFocus
            className="input-chunk font-mono tracking-[0.4em] text-center text-lg"
            aria-label="6-digit code"
          />
          <div className="flex gap-2">
            <button type="button" onClick={cancelEnroll} disabled={busy} className="btn-chunk bg-white flex-1 disabled:opacity-60">
              Cancel
            </button>
            <button disabled={busy || code.length !== 6} className="btn-chunk bg-candy-mint flex-1 disabled:opacity-60">
              {busy ? 'Verifying…' : 'Verify & enable'}
            </button>
          </div>
          <Banner kind="error">{err}</Banner>
        </form>
      ) : disablingId ? (
        <form onSubmit={finishDisable} className="space-y-3">
          <p className="text-sm text-ink/80">
            Enter your current 6-digit code to turn off two-factor authentication.
          </p>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456" autoFocus
            className="input-chunk font-mono tracking-[0.4em] text-center text-lg"
            aria-label="6-digit code"
          />
          <div className="flex gap-2">
            <button type="button" onClick={cancelDisable} disabled={busy} className="btn-chunk bg-white flex-1 disabled:opacity-60">
              Cancel
            </button>
            <button disabled={busy || code.length !== 6} className="btn-chunk bg-candy-pink text-white flex-1 disabled:opacity-60">
              {busy ? 'Disabling…' : 'Turn off 2FA'}
            </button>
          </div>
          <Banner kind="error">{err}</Banner>
        </form>
      ) : enabled ? (
        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-candy-mint border-2 border-ink" />
                <span className="font-semibold">2FA is on</span>
              </div>
              <p className="text-xs text-ink/60 mt-1">You'll be asked for a code every time you sign in.</p>
            </div>
            <button
              onClick={() => startDisable(verified[0].id)}
              className="btn-chunk bg-white text-sm py-2 px-3 shrink-0"
            >
              Turn off
            </button>
          </div>
          <Banner kind="ok">{msg}</Banner>
        </div>
      ) : (
        <div>
          <p className="text-sm text-ink/80">
            Add a second step at sign-in. Use any authenticator app to generate a 6-digit code from your phone.
          </p>
          <button
            onClick={startEnroll}
            disabled={busy}
            className="btn-chunk bg-candy-mint mt-4 disabled:opacity-60"
          >
            {busy ? 'Preparing…' : 'Enable 2FA'}
          </button>
          <Banner kind="error">{err}</Banner>
          <Banner kind="ok">{msg}</Banner>
        </div>
      )}
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
    // Best-effort: wipe this user's logo folder before deleting the account.
    // Storage RLS scopes objects under {user_id}/, so we can list and remove
    // by user id alone.
    try {
      if (user?.id) {
        const { data: gameFolders } = await supabase.storage.from('game-logos').list(user.id, { limit: 1000 })
        const paths = []
        for (const folder of gameFolders ?? []) {
          const { data: files } = await supabase.storage.from('game-logos').list(`${user.id}/${folder.name}`, { limit: 100 })
          for (const f of files ?? []) paths.push(`${user.id}/${folder.name}/${f.name}`)
        }
        if (paths.length) await supabase.storage.from('game-logos').remove(paths)
      }
    } catch {/* don't block account deletion on storage cleanup */}
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
