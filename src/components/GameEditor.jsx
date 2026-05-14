import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { TEAM_PALETTE, nextColor } from '../lib/colors.js'

// initial: null for new game, or full game object (with teams + user_id)
export default function GameEditor({ initial, onClose, onSaved }) {
  const { user } = useAuth()
  const isEdit = !!initial
  const isOwner = !isEdit || initial.user_id === user?.id

  const [name, setName] = useState(initial?.name ?? '')
  const [teams, setTeams] = useState(
    initial?.teams?.length
      ? initial.teams.map(t => ({ ...t, _existing: true }))
      : [{ id: tmp(), name: 'Team 1', color: TEAM_PALETTE[0] }, { id: tmp(), name: 'Team 2', color: TEAM_PALETTE[1] }]
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const addTeam = () => {
    setTeams(ts => [...ts, { id: tmp(), name: `Team ${ts.length + 1}`, color: nextColor(ts.map(t => t.color)) }])
  }
  const removeTeam = (id) => setTeams(ts => ts.filter(t => t.id !== id))
  const updateTeam = (id, patch) => setTeams(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))

  const save = async () => {
    setErr(null)
    if (!name.trim()) return setErr('Name your game.')
    if (teams.length < 1) return setErr('Add at least one team.')
    if (teams.some(t => !t.name.trim())) return setErr('Every team needs a name.')

    setBusy(true)
    try {
      let gameId = initial?.id
      if (isEdit) {
        const { error } = await supabase.from('games').update({ name }).eq('id', gameId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('games').insert({ name, user_id: user.id }).select().single()
        if (error) throw error
        gameId = data.id
      }

      const existing = initial?.teams ?? []
      const keptIds = teams.filter(t => t._existing).map(t => t.id)
      const toDelete = existing.filter(e => !keptIds.includes(e.id)).map(e => e.id)
      if (toDelete.length) {
        const { error } = await supabase.from('teams').delete().in('id', toDelete)
        if (error) throw error
      }

      for (let i = 0; i < teams.length; i++) {
        const t = teams[i]
        if (t._existing) {
          const { error } = await supabase.from('teams')
            .update({ name: t.name, color: t.color, position: i })
            .eq('id', t.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('teams')
            .insert({ game_id: gameId, name: t.name, color: t.color, position: i })
          if (error) throw error
        }
      }
      onSaved()
    } catch (e) {
      setErr(e.message ?? 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/40 backdrop-blur-sm p-0 md:p-4"
      onClick={onClose}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ y: 60, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        className="card-chunk w-full md:max-w-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="p-6 md:p-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-3xl font-bold">
              {isEdit ? 'Edit game' : 'New game'}
              {isEdit && !isOwner && <span className="ml-2 text-sm font-semibold text-ink/60">(shared)</span>}
            </h2>
            <button onClick={onClose} className="w-10 h-10 rounded-2xl border-2 border-ink bg-white grid place-items-center font-bold">×</button>
          </div>

          <label className="block text-sm font-semibold mb-1">Game name</label>
          <input
            className="input-chunk mb-6"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Friday Quiz Night"
            autoFocus
          />

          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold">Teams</label>
            <button onClick={addTeam} className="btn-chunk bg-candy-yellow text-sm py-1.5 px-3">+ Add team</button>
          </div>

          <div className="space-y-2">
            {teams.map((t, i) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-2 p-2 rounded-2xl border-2 border-ink bg-cream"
              >
                <ColorPicker value={t.color} onChange={c => updateTeam(t.id, { color: c })} />
                <input
                  className="flex-1 px-3 py-2 rounded-xl border-2 border-ink bg-white outline-none font-medium"
                  value={t.name}
                  onChange={e => updateTeam(t.id, { name: e.target.value })}
                  placeholder={`Team ${i + 1}`}
                />
                <button
                  onClick={() => removeTeam(t.id)}
                  className="w-10 h-10 rounded-xl border-2 border-ink bg-white hover:bg-candy-pink hover:text-white font-bold transition"
                  title="Remove"
                >×</button>
              </motion.div>
            ))}
          </div>

          {isEdit && isOwner && <SharingSection gameId={initial.id} initialIsPublic={initial.is_public} initialToken={initial.public_token} />}
          {isEdit && isOwner && <MembersSection gameId={initial.id} ownerId={initial.user_id} />}

          {err && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mt-4 px-3 py-2 rounded-xl border-2 border-ink bg-candy-yellow/70 text-sm">
              {err}
            </motion.div>
          )}

          <div className="flex gap-2 mt-6">
            <button onClick={onClose} className="btn-chunk bg-white flex-1">Cancel</button>
            <button onClick={save} disabled={busy} className="btn-chunk bg-candy-mint flex-1 text-lg disabled:opacity-60">
              {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create game'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function SharingSection({ gameId, initialIsPublic, initialToken }) {
  const [isPublic, setIsPublic] = useState(!!initialIsPublic)
  const [token, setToken] = useState(initialToken ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [copied, setCopied] = useState(false)

  const url = token ? `${window.location.origin}/p/${token}` : ''

  const toggle = async (enabled) => {
    setErr(null); setBusy(true)
    const { data, error } = await supabase.rpc('set_game_sharing', {
      p_game_id: gameId, p_enabled: enabled
    })
    setBusy(false)
    if (error) return setErr(error.message)
    setIsPublic(data.is_public)
    setToken(data.public_token)
  }

  const rotate = async () => {
    if (!confirm('Generate a new link? The old one will stop working immediately.')) return
    setErr(null); setBusy(true)
    const { data, error } = await supabase.rpc('rotate_game_token', { p_game_id: gameId })
    setBusy(false)
    if (error) return setErr(error.message)
    setToken(data.public_token)
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setErr('Could not copy. Select the link and copy manually.')
    }
  }

  return (
    <div className="mt-6 pt-6 border-t-2 border-dashed border-ink/20">
      <div className="flex items-center justify-between mb-3">
        <div>
          <label className="block text-sm font-semibold">Public link</label>
          <p className="text-xs text-ink/60">Anyone with the link can watch live. They can't change anything.</p>
        </div>
        <button
          type="button"
          onClick={() => toggle(!isPublic)}
          disabled={busy}
          aria-pressed={isPublic}
          className={`relative w-14 h-8 rounded-full border-2 border-ink transition-colors disabled:opacity-60 ${isPublic ? 'bg-candy-mint' : 'bg-white'}`}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-0.5 w-6 h-6 rounded-full bg-ink"
            style={{ left: isPublic ? 'calc(100% - 26px)' : '2px' }}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isPublic && token && (
          <motion.div
            key="share-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <input
                readOnly
                value={url}
                onFocus={e => e.target.select()}
                className="input-chunk flex-1 font-mono text-sm bg-candy-yellow/40"
              />
              <button type="button" onClick={copy} className="btn-chunk bg-white">
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button type="button" onClick={rotate} disabled={busy} className="btn-chunk bg-candy-pink text-white disabled:opacity-60">
                Regenerate
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {err && <div className="mt-2 px-3 py-2 rounded-xl border-2 border-ink bg-candy-pink/30 text-sm">{err}</div>}
    </div>
  )
}

function MembersSection({ gameId, ownerId }) {
  const [members, setMembers] = useState([])
  const [ownerProfile, setOwnerProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const load = async () => {
    const [{ data: mems }, { data: own }] = await Promise.all([
      supabase.from('game_members')
        .select('user_id, created_at, profiles:user_id (email)')
        .eq('game_id', gameId)
        .order('created_at'),
      supabase.from('profiles').select('email').eq('id', ownerId).single()
    ])
    setMembers(mems ?? [])
    setOwnerProfile(own ?? null)
  }

  useEffect(() => {
    load()
    const channel = supabase.channel(`members:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_members', filter: `game_id=eq.${gameId}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  const invite = async (e) => {
    e.preventDefault()
    setErr(null); setMsg(null); setBusy(true)
    const { error } = await supabase.rpc('invite_collaborator', { p_game_id: gameId, p_email: email.trim() })
    setBusy(false)
    if (error) setErr(error.message)
    else { setMsg(`Invited ${email}.`); setEmail('') }
  }

  const remove = async (userId) => {
    if (!confirm('Remove this collaborator?')) return
    const { error } = await supabase.from('game_members').delete()
      .eq('game_id', gameId).eq('user_id', userId)
    if (error) setErr(error.message)
  }

  return (
    <div className="mt-6 pt-6 border-t-2 border-dashed border-ink/20">
      <label className="block text-sm font-semibold mb-2">Collaborators</label>

      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 p-2 rounded-2xl border-2 border-ink bg-candy-yellow/40">
          <div className="w-9 h-9 rounded-xl border-2 border-ink bg-candy-yellow grid place-items-center font-bold">★</div>
          <div className="flex-1 truncate">
            <div className="font-semibold truncate">{ownerProfile?.email ?? '…'}</div>
            <div className="text-xs text-ink/60">owner</div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {members.map(m => (
            <motion.div
              key={m.user_id}
              layout
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 8 }}
              className="flex items-center gap-2 p-2 rounded-2xl border-2 border-ink bg-white"
            >
              <div className="w-9 h-9 rounded-xl border-2 border-ink bg-candy-mint grid place-items-center font-bold">
                {(m.profiles?.email ?? '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 truncate">
                <div className="font-semibold truncate">{m.profiles?.email ?? '…'}</div>
                <div className="text-xs text-ink/60">collaborator</div>
              </div>
              <button
                onClick={() => remove(m.user_id)}
                className="px-3 py-1.5 rounded-xl border-2 border-ink bg-white hover:bg-candy-pink hover:text-white text-sm font-semibold transition"
              >Remove</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <form onSubmit={invite} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="invite by email (must have an account)"
          className="input-chunk flex-1"
        />
        <button disabled={busy || !email} className="btn-chunk bg-candy-pink text-white disabled:opacity-60">
          Invite
        </button>
      </form>
      {err && <div className="mt-2 px-3 py-2 rounded-xl border-2 border-ink bg-candy-pink/30 text-sm">{err}</div>}
      {msg && <div className="mt-2 px-3 py-2 rounded-xl border-2 border-ink bg-candy-mint/50 text-sm">{msg}</div>}
    </div>
  )
}

function ColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-10 h-10 rounded-xl border-2 border-ink"
        style={{ background: value }}
        title="Change color"
      />
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="absolute z-30 mt-2 p-2 rounded-2xl border-2 border-ink bg-white shadow-chunk grid grid-cols-5 gap-1.5"
        >
          {TEAM_PALETTE.map(c => (
            <button
              key={c}
              onClick={() => { onChange(c); setOpen(false) }}
              className={`w-7 h-7 rounded-lg border-2 border-ink ${value === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-white' : ''}`}
              style={{ background: c }}
            />
          ))}
        </motion.div>
      )}
    </div>
  )
}

function tmp() { return 'tmp-' + Math.random().toString(36).slice(2, 9) }
