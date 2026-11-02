import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth.jsx'
import { useDialogs } from '../components/Dialogs.jsx'
import { addPasskey, passkeysSupported } from '../lib/passkeys.js'

export default function Account() {
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const dialogs = useDialogs()

  const handleSignOut = async () => {
    const ok = await dialogs.confirm({
      title: 'Sign out?',
      message: 'You can sign back in any time.',
      confirmLabel: 'Sign out',
      tone: 'neutral',
    })
    if (ok) await signOut()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full pb-home bg-cream bg-grid"
    >
      <header className="px-6 md:px-10 py-6 flex items-center justify-between border-b-2 border-ink bg-cream/80 backdrop-blur sticky top-0 z-20">
        <Link to="/" className="btn-chunk bg-white text-sm py-2 px-3">← Games</Link>
        <h1 className="font-display font-bold text-2xl">Account</h1>
        <button
          onClick={handleSignOut}
          className="btn-chunk bg-white text-sm py-2 px-3 inline-flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 md:px-10 py-10 space-y-6">
        <NameCard />
        <EmailCard currentEmail={user?.email} />
        <PasswordCard />
        <PasskeysCard />
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
  const { user, refresh } = useAuth()
  const original = user?.display_name ?? ''
  const [name, setName] = useState(original)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setMsg(null)
    const next = name.trim()
    if (!next) return setErr('Name can\'t be empty.')
    if (next === original) return setErr('Pick a different name.')

    setBusy(true)
    const { error } = await api.updateAccount({ display_name: next })
    setBusy(false)
    if (error) return setErr(error.message)
    await refresh()
    setMsg('Name updated.')
  }

  return (
    <Section title="Name" accent="#5EE2C1">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text" required
          value={name} onChange={e => setName(e.target.value)}
          placeholder="your name"
          className="input-chunk flex-1"
        />
        <button disabled={busy} className="btn-chunk bg-candy-mint disabled:opacity-60">
          {busy ? 'Updating…' : 'Update name'}
        </button>
      </form>
      <Banner kind="error">{err}</Banner>
      <Banner kind="ok">{msg}</Banner>
    </Section>
  )
}

function EmailCard({ currentEmail }) {
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setMsg(null)
    if (!email || email === currentEmail) return setErr('Pick a different email.')
    setBusy(true)
    const { error } = await api.changeEmail(email)
    setBusy(false)
    if (error) return setErr(error.message)
    await refresh()
    setMsg('Email updated.')
    setEmail('')
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
  const { user, refresh } = useAuth()
  const [allowInvites, setAllowInvites] = useState(user?.allow_invites ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const toggle = async () => {
    if (busy) return
    const next = !allowInvites
    setAllowInvites(next)
    setBusy(true); setErr(null)
    const { error } = await api.updateAccount({ allow_invites: next })
    setBusy(false)
    if (error) {
      setAllowInvites(!next)
      setErr(error.message)
      return
    }
    await refresh()
  }

  return (
    <Section title="Privacy" accent="#9B6DFF">
      <div className="flex items-center justify-between gap-4">
        <div>
          <label className="block text-sm font-semibold">Allow others to add me to games</label>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
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
    const { error } = await api.changePassword(current, next)
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
  const { refresh } = useAuth()
  const [enabled, setEnabled] = useState(null)   // null while loading
  const [enrolling, setEnrolling] = useState(null) // { secret, uri }
  const [disabling, setDisabling] = useState(false)
  const [code, setCode] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = async () => {
    setErr(null)
    const { data, error } = await api.getMfaStatus()
    if (error) { setErr(error.message); setEnabled(false); return }
    setEnabled(!!data.enabled)
  }

  useEffect(() => { load() }, [])

  const startEnroll = async () => {
    setErr(null); setMsg(null); setBusy(true)
    const { data, error } = await api.enrollMfa()
    setBusy(false)
    if (error) return setErr(error.message)
    setEnrolling({ secret: data.secret, uri: data.uri })
    setCode('')
    setShowSecret(false)
  }

  const cancelEnroll = async () => {
    setBusy(true)
    await api.cancelMfaEnrollment()
    setBusy(false)
    setEnrolling(null)
    setCode('')
    setErr(null)
  }

  const finishEnroll = async (e) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    const { error } = await api.enableMfa(code.trim())
    setBusy(false)
    if (error) return setErr(error.message)
    setEnrolling(null)
    setCode('')
    setMsg('Two-factor authentication is on.')
    await load()
    await refresh()
  }

  const finishDisable = async (e) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    const { error } = await api.disableMfa(code.trim())
    setBusy(false)
    if (error) return setErr(error.message)
    setDisabling(false)
    setCode('')
    setMsg('Two-factor authentication turned off.')
    await load()
    await refresh()
  }

  return (
    <Section title="Authenticator app" accent="#4D7CFF">
      {enabled === null ? (
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
              <QRCodeSVG value={enrolling.uri} size={152} level="M" />
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
      ) : disabling ? (
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
            <button
              type="button"
              onClick={() => { setDisabling(false); setCode(''); setErr(null) }}
              disabled={busy}
              className="btn-chunk bg-white flex-1 disabled:opacity-60"
            >
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
            </div>
            <button
              onClick={() => { setDisabling(true); setCode(''); setErr(null); setMsg(null) }}
              className="btn-chunk bg-white text-sm py-2 px-3 shrink-0"
            >
              Turn off
            </button>
          </div>
          <Banner kind="ok">{msg}</Banner>
        </div>
      ) : (
        <div>
          <button
            onClick={startEnroll}
            disabled={busy}
            className="btn-chunk bg-candy-mint disabled:opacity-60"
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

/** A friendly default label for a new passkey, e.g. "iPhone" or "Mac". */
function guessDeviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return navigator.maxTouchPoints > 1 ? 'iPad' : 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  if (/CrOS/.test(ua)) return 'Chromebook'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Passkey'
}

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null

function PasskeysCard() {
  const dialogs = useDialogs()
  const supported = passkeysSupported()
  const [passkeys, setPasskeys] = useState(null) // null while loading
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = async () => {
    const { data, error } = await api.listPasskeys()
    if (error) { setErr(error.message); setPasskeys([]); return }
    setPasskeys(data ?? [])
  }

  useEffect(() => { load() }, [])

  const add = async () => {
    setErr(null); setMsg(null); setBusy(true)
    const { error } = await addPasskey(guessDeviceName())
    setBusy(false)
    if (error) return setErr(error.message)
    setMsg('Passkey added. You can now sign in with it, and it also works as your second factor.')
    await load()
  }

  const remove = async (pk) => {
    const ok = await dialogs.confirm({
      title: `Remove "${pk.name}"?`,
      message: 'You won\'t be able to sign in with this passkey anymore. Also delete it from your device or password manager.',
      confirmLabel: 'Remove',
    })
    if (!ok) return
    setErr(null); setMsg(null)
    const { error } = await api.deletePasskey(pk.id)
    if (error) return setErr(error.message)
    await load()
  }

  return (
    <Section title="Passkeys" accent="#5EE2C1">
      <p className="text-sm text-ink/80 mb-4">
        Sign in with Face ID, Touch ID, Windows Hello or a security key — no password needed.
        When you sign in with your password, a passkey also works as your second factor.
      </p>
      {passkeys === null ? (
        <div className="text-sm text-ink/60">Loading…</div>
      ) : (
        <>
          {passkeys.length > 0 && (
            <ul className="space-y-2 mb-4">
              {passkeys.map(pk => (
                <li key={pk.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border-2 border-ink bg-white">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{pk.name}</div>
                    <div className="text-xs text-ink/60">
                      Added {formatDate(pk.created_at)}
                      {pk.last_used_at && <> · last used {formatDate(pk.last_used_at)}</>}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(pk)}
                    className="btn-chunk bg-white text-sm py-1.5 px-3 shrink-0"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {supported ? (
            <button onClick={add} disabled={busy} className="btn-chunk bg-candy-mint disabled:opacity-60">
              {busy ? 'Waiting for passkey…' : passkeys.length ? 'Add another passkey' : 'Add a passkey'}
            </button>
          ) : (
            <div className="text-sm text-ink/60">This browser doesn't support passkeys.</div>
          )}
        </>
      )}
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
    // The server cascades the delete and clears this user's stored logos.
    const { error } = await api.deleteAccount()
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
