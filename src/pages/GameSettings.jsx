import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, logoUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { TEAM_PALETTE, nextColor } from '../lib/colors.js'
import { useDialogs } from '../components/Dialogs.jsx'

const DEFAULT_PRESETS = [5, 10, 15, -5, -10, -15]
const MAX_PRESETS = 24
const SORT_MODES = ['manual', 'desc', 'asc']
const SORT_OPTIONS = [
  { id: 'manual', label: 'Manual', hint: 'Drag handles set order' },
  { id: 'desc', label: 'Points ↓', hint: 'Highest score on top' },
  { id: 'asc', label: 'Points ↑', hint: 'Lowest score on top' },
]

// Route wrapper: loads the game for edit mode, then renders the tabbed form.
// New-game mode (`/game/new`) skips the load and starts with a blank form.
export default function GameSettings() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const isEdit = !!id

  const [initial, setInitial] = useState(null)
  const [loading, setLoading] = useState(isEdit)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('games')
        .select('id, name, user_id, is_public, public_token, allow_negative, logo_path, logo_placement, logo_shape, logo_scale, point_presets, team_sort, teams (id, name, color, score, position)')
        .eq('id', id)
        .single()
      if (cancelled) return
      if (error || !data) { setNotFound(true); setLoading(false); return }
      data.teams = (data.teams ?? []).sort((a, b) => a.position - b.position)
      setInitial(data)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id, isEdit])

  if (loading) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-cream font-display text-3xl animate-pulse">
        loading…
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-cream">
        <div className="card-chunk p-8 text-center">
          <h2 className="font-display text-3xl font-bold">Game not found</h2>
          <button onClick={() => nav('/')} className="btn-chunk bg-candy-mint mt-4">← Back</button>
        </div>
      </div>
    )
  }

  return <SettingsForm initial={isEdit ? initial : null} user={user} nav={nav} />
}

function SettingsForm({ initial, user, nav }) {
  const isEdit = !!initial
  const isOwner = !isEdit || initial.user_id === user?.id
  const instant = isEdit  // every change writes through immediately

  const [name, setName] = useState(initial?.name ?? '')
  const [allowNegative, setAllowNegative] = useState(!!initial?.allow_negative)
  const [teamSort, setTeamSort] = useState(
    SORT_MODES.includes(initial?.team_sort) ? initial.team_sort : 'manual'
  )
  const [presets, setPresets] = useState(
    Array.isArray(initial?.point_presets) ? [...initial.point_presets] : DEFAULT_PRESETS.slice()
  )
  const [teams, setTeams] = useState(
    initial?.teams?.length
      ? initial.teams.map(t => ({ ...t }))
      : [{ id: tmp(), name: 'Team 1', color: TEAM_PALETTE[0] }, { id: tmp(), name: 'Team 2', color: TEAM_PALETTE[1] }]
  )

  // Logo state
  const [logoPath, setLogoPath] = useState(initial?.logo_path ?? null)
  const [logoPlacement, setLogoPlacement] = useState(initial?.logo_placement ?? 'center')
  const [logoShape, setLogoShape] = useState(initial?.logo_shape ?? 'circle')
  const [logoScale, setLogoScale] = useState(initial?.logo_scale ?? 0.8)
  const [pendingFile, setPendingFile] = useState(null)
  const [pendingPreview, setPendingPreview] = useState(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState('general')

  useEffect(() => () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview) }, [pendingPreview])

  const close = () => nav(isEdit ? -1 : '/')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // --- Instant-apply primitives (edit mode) ---
  const patchGame = async (patch) => {
    const { error } = await supabase.from('games').update(patch).eq('id', initial.id)
    if (error) setErr(error.message)
  }

  const commitName = async () => {
    if (!instant) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === initial.name) return
    setName(trimmed)
    await patchGame({ name: trimmed })
  }

  const toggleNegative = async () => {
    const next = !allowNegative
    setAllowNegative(next)
    if (instant) await patchGame({ allow_negative: next })
  }

  const commitTeamSort = async (mode) => {
    if (!SORT_MODES.includes(mode) || mode === teamSort) return
    setTeamSort(mode)
    if (instant) await patchGame({ team_sort: mode })
  }

  const commitPresets = async (next) => {
    setPresets(next)
    if (instant) await patchGame({ point_presets: next })
  }

  const addTeam = async () => {
    const color = nextColor(teams.map(t => t.color))
    const newName = `Team ${teams.length + 1}`
    if (instant) {
      const { data, error } = await supabase.from('teams')
        .insert({ game_id: initial.id, name: newName, color, position: teams.length })
        .select('id, name, color, score, position')
        .single()
      if (error) { setErr(error.message); return }
      setTeams(ts => [...ts, data])
    } else {
      setTeams(ts => [...ts, { id: tmp(), name: newName, color }])
    }
  }

  const removeTeam = async (id) => {
    if (instant && !String(id).startsWith('tmp-')) {
      const { error } = await supabase.from('teams').delete().eq('id', id)
      if (error) { setErr(error.message); return }
    }
    setTeams(ts => ts.filter(t => t.id !== id))
  }

  const updateTeam = async (id, patch) => {
    setTeams(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))
    if (instant && !String(id).startsWith('tmp-')) {
      const { error } = await supabase.from('teams').update(patch).eq('id', id)
      if (error) setErr(error.message)
    }
  }

  const commitTeamName = async (id, value) => {
    const v = value.trim()
    if (!v) return
    if (!instant || String(id).startsWith('tmp-')) return
    setTeams(ts => ts.map(t => t.id === id ? { ...t, name: v } : t))
    const { error } = await supabase.from('teams').update({ name: v }).eq('id', id)
    if (error) setErr(error.message)
  }

  const moveTeam = async (index, dir) => {
    const j = index + dir
    if (j < 0 || j >= teams.length) return
    const next = teams.slice()
    ;[next[index], next[j]] = [next[j], next[index]]
    setTeams(next)
    if (instant) {
      const a = next[index], b = next[j]
      // Reassign positions for the two swapped rows.
      if (!String(a.id).startsWith('tmp-')) {
        await supabase.from('teams').update({ position: index }).eq('id', a.id)
      }
      if (!String(b.id).startsWith('tmp-')) {
        await supabase.from('teams').update({ position: j }).eq('id', b.id)
      }
    }
  }

  // --- Logo handlers ---
  const handleLogoFile = async (file) => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setErr(null)
    setRemoveLogo(false)
    if (!instant) {
      // New-game flow: hold the file until create.
      setPendingFile(file)
      setPendingPreview(file ? URL.createObjectURL(file) : null)
      return
    }
    if (!file) return
    setLogoBusy(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'png'
      const newPath = `${user.id}/${initial.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
      const { error: upErr } = await supabase.storage
        .from('game-logos')
        .upload(newPath, file, { contentType: file.type, upsert: false })
      if (upErr) throw upErr
      if (logoPath) await supabase.storage.from('game-logos').remove([logoPath])
      const placement = logoPlacement || 'center'
      await patchGame({ logo_path: newPath, logo_placement: placement })
      setLogoPath(newPath)
      setLogoPlacement(placement)
    } catch (e) {
      setErr(e.message ?? 'Could not upload logo.')
    } finally {
      setLogoBusy(false)
    }
  }

  const handleLogoPlacement = async (p) => {
    setLogoPlacement(p)
    if (instant && logoPath) await patchGame({ logo_placement: p })
  }

  const handleLogoShape = async (s) => {
    setLogoShape(s)
    if (instant) await patchGame({ logo_shape: s })
  }

  const scaleCommitRef = useRef(null)
  const handleLogoScale = (v) => {
    const next = Math.max(0.4, Math.min(1.6, Math.round(v * 100) / 100))
    setLogoScale(next)
    if (!instant) return
    if (scaleCommitRef.current) clearTimeout(scaleCommitRef.current)
    scaleCommitRef.current = setTimeout(() => { patchGame({ logo_scale: next }) }, 250)
  }

  const handleLogoClear = async () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null)
    setPendingPreview(null)
    if (!instant) {
      // New-game flow: just forget the pending file.
      if (logoPath) setRemoveLogo(true)
      return
    }
    if (!logoPath) return
    setLogoBusy(true)
    try {
      await supabase.storage.from('game-logos').remove([logoPath])
      await patchGame({ logo_path: null, logo_placement: null })
      setLogoPath(null)
    } catch (e) {
      setErr(e.message ?? 'Could not remove logo.')
    } finally {
      setLogoBusy(false)
    }
  }

  // --- New-game create flow (only used when isEdit === false) ---
  const create = async () => {
    setErr(null)
    if (!name.trim()) { setTab('general'); return setErr('Name your game.') }
    if (teams.length < 1) { setTab('teams'); return setErr('Add at least one team.') }
    if (teams.some(t => !t.name.trim())) { setTab('teams'); return setErr('Every team needs a name.') }

    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('create_game', { p_name: name })
      if (error) throw error
      const gameId = data.id
      const samePresets = presets.length === DEFAULT_PRESETS.length
        && presets.every((v, i) => v === DEFAULT_PRESETS[i])
      const initialPatch = {}
      if (allowNegative) initialPatch.allow_negative = true
      if (!samePresets) initialPatch.point_presets = presets
      if (teamSort !== 'manual') initialPatch.team_sort = teamSort
      if (Object.keys(initialPatch).length) {
        const { error: e2 } = await supabase.from('games')
          .update(initialPatch).eq('id', gameId)
        if (e2) throw e2
      }

      if (pendingFile) {
        const ext = (pendingFile.name.split('.').pop() || 'png').toLowerCase()
        const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'png'
        const newPath = `${user.id}/${gameId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
        const { error: upErr } = await supabase.storage
          .from('game-logos')
          .upload(newPath, pendingFile, { contentType: pendingFile.type, upsert: false })
        if (upErr) throw upErr
        const { error: lErr } = await supabase.from('games')
          .update({
            logo_path: newPath,
            logo_placement: logoPlacement || 'center',
            logo_shape: logoShape,
            logo_scale: logoScale,
          })
          .eq('id', gameId)
        if (lErr) throw lErr
      }

      for (let i = 0; i < teams.length; i++) {
        const t = teams[i]
        const { error } = await supabase.from('teams')
          .insert({ game_id: gameId, name: t.name, color: t.color, position: i })
        if (error) throw error
      }
      // Drop straight into the freshly created game.
      nav(`/game/${gameId}`, { replace: true })
    } catch (e) {
      setErr(e.message ?? 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  // Sharing/Members need a persisted game, so they're owner+edit only.
  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'teams', label: 'Teams' },
    { id: 'scoring', label: 'Scoring' },
    ...(isOwner ? [{ id: 'appearance', label: 'Appearance' }] : []),
    ...(isEdit && isOwner ? [{ id: 'sharing', label: 'Sharing' }] : []),
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-cream bg-grid flex flex-col"
    >
      {/* Top bar */}
      <header className="shrink-0 px-4 md:px-8 py-3 md:py-4 flex items-center justify-between gap-3 bg-cream/80 backdrop-blur border-b-2 border-ink z-20">
        <button
          onClick={close}
          className="btn-chunk bg-white text-sm py-2 p-2 md:px-3"
          aria-label={isEdit ? 'Back' : 'Cancel'}
          title={isEdit ? 'Back' : 'Cancel'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          <span className="hidden md:inline">{isEdit ? 'Back' : 'Cancel'}</span>
        </button>
        <div className="min-w-0 text-center flex-1">
          <h1 className="font-display font-bold text-lg md:text-2xl truncate leading-none">
            {isEdit ? (name || 'Settings') : 'New game'}
          </h1>
          <div className="text-xs md:text-sm text-ink/60 mt-0.5">
            Settings{isEdit && !isOwner ? ' · shared' : ''}
          </div>
        </div>
        {isEdit ? (
          <button onClick={close} className="btn-chunk bg-candy-mint text-sm py-2 px-3 md:px-4">
            Done
          </button>
        ) : (
          <button onClick={create} disabled={busy} className="btn-chunk bg-candy-mint text-sm py-2 px-3 md:px-4 disabled:opacity-60">
            {busy ? 'Creating…' : 'Create'}
          </button>
        )}
      </header>

      {/* Tabs */}
      <nav className="shrink-0 border-b-2 border-ink bg-cream/60 overflow-x-auto no-scrollbar">
        <div className="flex gap-1 px-3 md:px-8 py-2 w-max md:w-auto">
          {tabs.map(t => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 md:px-4 py-2 rounded-xl border-2 font-display font-semibold text-sm transition whitespace-nowrap ${
                  active
                    ? 'border-ink bg-candy-yellow shadow-chunk-sm'
                    : 'border-transparent text-ink/70 hover:text-ink hover:bg-white'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto no-scrollbar">
        <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-8">
          {tab === 'general' && (
            <div>
              <label className="block text-sm font-semibold mb-1">Game name</label>
              <input
                className="input-chunk mb-6"
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                placeholder="Friday Quiz Night"
                autoFocus={!isEdit}
              />

              <div className="mb-6 flex items-center justify-between gap-4 p-3 rounded-2xl border-2 border-dashed border-ink/20">
                <div>
                  <label className="block text-sm font-semibold">Allow negative scores</label>
                  <p className="text-xs text-ink/60">When off, scores can't go below zero.</p>
                </div>
                <Toggle on={allowNegative} onClick={toggleNegative} />
              </div>

              <div className="p-3 rounded-2xl border-2 border-dashed border-ink/20">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <label className="block text-sm font-semibold">Team order</label>
                  <span className="text-xs text-ink/60 truncate">
                    {SORT_OPTIONS.find(o => o.id === teamSort)?.hint}
                  </span>
                </div>
                <div
                  role="radiogroup"
                  aria-label="Team order"
                  className="grid grid-cols-3 gap-1 p-1 rounded-2xl border-2 border-ink bg-white"
                >
                  {SORT_OPTIONS.map(opt => {
                    const active = opt.id === teamSort
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => commitTeamSort(opt.id)}
                        className={`px-2 py-2 rounded-xl font-display font-semibold text-sm transition ${
                          active ? 'bg-candy-mint text-ink shadow-chunk-sm' : 'text-ink/70 hover:text-ink hover:bg-cream'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'teams' && (
            <div>
              <label className="block text-sm font-semibold mb-2">Teams</label>
              <div className="space-y-2">
                {teams.map((t, i) => (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                    className="flex items-center gap-2 p-2 rounded-2xl border-2 border-ink bg-cream"
                  >
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveTeam(i, -1)}
                        disabled={i === 0 || teamSort !== 'manual'}
                        className="w-6 h-[18px] rounded-md border-2 border-ink bg-white grid place-items-center text-[10px] leading-none font-bold disabled:opacity-30 hover:bg-candy-yellow transition"
                        title={teamSort === 'manual' ? 'Move up' : 'Sorted by points — switch to Manual to reorder'}
                        aria-label="Move up"
                      >▲</button>
                      <button
                        type="button"
                        onClick={() => moveTeam(i, 1)}
                        disabled={i === teams.length - 1 || teamSort !== 'manual'}
                        className="w-6 h-[18px] rounded-md border-2 border-ink bg-white grid place-items-center text-[10px] leading-none font-bold disabled:opacity-30 hover:bg-candy-yellow transition"
                        title={teamSort === 'manual' ? 'Move down' : 'Sorted by points — switch to Manual to reorder'}
                        aria-label="Move down"
                      >▼</button>
                    </div>
                    <ColorPicker value={t.color} onChange={c => updateTeam(t.id, { color: c })} />
                    <input
                      className="flex-1 px-3 py-2 rounded-xl border-2 border-ink bg-white outline-none font-medium"
                      value={t.name}
                      onChange={e => setTeams(ts => ts.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))}
                      onBlur={e => commitTeamName(t.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      placeholder={`Team ${i + 1}`}
                    />
                    <button
                      onClick={() => removeTeam(t.id)}
                      className="w-10 h-10 rounded-xl border-2 border-ink bg-white hover:bg-candy-pink hover:text-white font-bold transition"
                      title="Remove"
                    >×</button>
                  </motion.div>
                ))}
                <motion.button
                  type="button"
                  layout
                  onClick={addTeam}
                  className="w-full flex items-center justify-center gap-2 p-2 rounded-2xl border-2 border-dashed border-ink/30 bg-cream/40 text-ink/60 hover:bg-candy-yellow hover:border-ink hover:text-ink font-display font-semibold transition"
                >
                  <span className="text-lg leading-none">+</span> Add team
                </motion.button>
              </div>
            </div>
          )}

          {tab === 'scoring' && (
            <PresetsSection presets={presets} onChange={commitPresets} />
          )}

          {tab === 'appearance' && isOwner && (
            <LogoSection
              logoPath={logoPath}
              placement={logoPlacement}
              shape={logoShape}
              scale={logoScale}
              pendingPreview={pendingPreview}
              removeLogo={removeLogo}
              busy={logoBusy}
              onFile={handleLogoFile}
              onPlacement={handleLogoPlacement}
              onShape={handleLogoShape}
              onScale={handleLogoScale}
              onClear={handleLogoClear}
            />
          )}

          {tab === 'sharing' && isEdit && isOwner && (
            <div>
              <SharingSection gameId={initial.id} initialIsPublic={initial.is_public} initialToken={initial.public_token} />
              <MembersSection gameId={initial.id} />
            </div>
          )}

          {err && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mt-6 px-3 py-2 rounded-xl border-2 border-ink bg-candy-yellow/70 text-sm">
              {err}
            </motion.div>
          )}
        </div>
      </main>
    </motion.div>
  )
}

function Toggle({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`relative w-14 h-8 rounded-full border-2 border-ink transition-colors ${on ? 'bg-candy-mint' : 'bg-white'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="absolute top-0.5 w-6 h-6 rounded-full bg-ink"
        style={{ left: on ? 'calc(100% - 26px)' : '2px' }}
      />
    </button>
  )
}

function LogoSection({ logoPath, placement, shape, scale, pendingPreview, removeLogo, busy, onFile, onPlacement, onShape, onScale, onClear }) {
  const fileRef = useRef(null)
  const [localErr, setLocalErr] = useState(null)
  const currentUrl = pendingPreview || (!removeLogo && logoPath ? logoUrl(logoPath) : null)
  const hasLogo = !!currentUrl

  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLocalErr('That doesn\'t look like an image.'); return
    }
    if (file.size > 2 * 1024 * 1024) {
      setLocalErr('Logo must be under 2MB.'); return
    }
    setLocalErr(null)
    onFile(file)
  }

  return (
    <div>
      <label className="block text-sm font-semibold mb-1">Logo</label>
      <p className="text-xs text-ink/60 mb-2">PNG, JPG, or SVG. Under 2MB.</p>

      <div className="flex items-center gap-3 p-3 rounded-2xl border-2 border-ink bg-cream">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-20 h-20 rounded-xl border-2 border-ink bg-white grid place-items-center overflow-hidden shrink-0 hover:bg-candy-yellow transition"
          aria-label={hasLogo ? 'Change logo' : 'Upload logo'}
        >
          {hasLogo ? (
            <img src={currentUrl} alt="Logo preview" className="w-full h-full object-contain" />
          ) : (
            <div className="text-center">
              <div className="font-display text-2xl font-bold leading-none">+</div>
              <div className="text-[10px] text-ink/60 font-semibold mt-0.5">Upload</div>
            </div>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />

        <div className="flex-1 min-w-0">
          {busy ? (
            <>
              <div className="text-sm font-semibold">Uploading…</div>
              <p className="text-xs text-ink/60">Hang tight for a sec.</p>
            </>
          ) : hasLogo ? (
            <>
              <div className="text-sm font-semibold">{pendingPreview ? 'New logo ready' : 'Logo uploaded'}</div>
              <p className="text-xs text-ink/60">Click the preview to change it.</p>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold">No logo yet</div>
              <p className="text-xs text-ink/60">Click the box to pick one.</p>
            </>
          )}
        </div>

        {hasLogo && (
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-1.5 rounded-xl border-2 border-ink bg-white hover:bg-candy-pink hover:text-white text-sm font-semibold transition shrink-0"
          >
            Remove
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {hasLogo && (
          <motion.div
            key="placement"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 pb-1">
              <div className="text-sm font-semibold mb-2">Where to show it</div>
              <div className="grid grid-cols-3 gap-2">
                <PlacementOption
                  active={placement === 'center'}
                  onClick={() => onPlacement('center')}
                  label="Center"
                  hint="Bubble badge"
                  preview={<CenterPreview />}
                />
                <PlacementOption
                  active={placement === 'top'}
                  onClick={() => onPlacement('top')}
                  label="Top row"
                  hint="Full width"
                  preview={<TopPreview />}
                />
                <PlacementOption
                  active={placement === 'menu'}
                  onClick={() => onPlacement('menu')}
                  label="Menu only"
                  hint="Game list"
                  preview={<MenuPreview />}
                />
              </div>
              <p className="text-xs text-ink/60 mt-2">
                The logo always appears on the game card in your list — these options control the game screen and public link.
              </p>

              <AnimatePresence initial={false}>
                {placement === 'center' && (
                  <motion.div
                    key="center-tuning"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 p-3 rounded-2xl border-2 border-dashed border-ink/20 space-y-3">
                      {/* Live preview + shape toggle */}
                      <div className="flex items-center gap-3">
                        <BadgePreview src={currentUrl} shape={shape} scale={scale} />
                        <div className="flex-1">
                          <div className="text-sm font-semibold mb-1.5">Badge shape</div>
                          <div className="flex gap-2">
                            <ShapeChip active={shape === 'circle'} onClick={() => onShape('circle')} label="Circle">
                              <span className="w-5 h-5 rounded-full border-2 border-ink bg-white block" />
                            </ShapeChip>
                            <ShapeChip active={shape === 'square'} onClick={() => onShape('square')} label="Rounded">
                              <span className="w-5 h-5 rounded-md border-2 border-ink bg-white block" />
                            </ShapeChip>
                          </div>
                        </div>
                      </div>

                      {/* Scale stepper */}
                      <div>
                        <div className="flex items-baseline justify-between mb-1.5">
                          <div className="text-sm font-semibold">Logo size</div>
                          <div className="text-xs text-ink/60">{Math.round(scale * 100)}%</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onScale(scale - 0.05)}
                            disabled={scale <= 0.4}
                            className="w-10 h-10 rounded-xl border-2 border-ink bg-white font-display text-xl font-bold hover:bg-candy-yellow transition disabled:opacity-40"
                            aria-label="Smaller"
                          >−</button>
                          <input
                            type="range"
                            min={40} max={160} step={5}
                            value={Math.round(scale * 100)}
                            onChange={e => onScale(Number(e.target.value) / 100)}
                            className="flex-1 accent-candy-pink py-2"
                            aria-label="Logo size"
                          />
                          <button
                            type="button"
                            onClick={() => onScale(scale + 0.05)}
                            disabled={scale >= 1.6}
                            className="w-10 h-10 rounded-xl border-2 border-ink bg-white font-display text-xl font-bold hover:bg-candy-mint transition disabled:opacity-40"
                            aria-label="Bigger"
                          >+</button>
                          <button
                            type="button"
                            onClick={() => onScale(0.8)}
                            className="text-xs font-semibold text-ink/70 hover:text-ink underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink"
                            title="Reset to 80%"
                          >Reset</button>
                        </div>
                        <p className="text-xs text-ink/60 mt-1.5">
                          Crank it up to crop out built-in whitespace, or shrink it for a roomier bubble.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {localErr && (
        <div className="mt-2 px-3 py-2 rounded-xl border-2 border-ink bg-candy-pink/30 text-sm">{localErr}</div>
      )}
    </div>
  )
}

function BadgePreview({ src, shape, scale }) {
  const radius = shape === 'square' ? 'rounded-xl' : 'rounded-full'
  const pct = Math.round(scale * 100)
  return (
    <div className={`shrink-0 w-20 h-20 ${radius} border-2 border-ink bg-white shadow-chunk-sm grid place-items-center overflow-hidden`}>
      {src ? (
        <img src={src} alt="" className="object-contain" style={{ width: `${pct}%`, height: `${pct}%` }} />
      ) : (
        <div className="text-[10px] text-ink/50 font-semibold">no logo</div>
      )}
    </div>
  )
}

function ShapeChip({ active, onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-ink font-display font-semibold text-sm transition ${
        active ? 'bg-candy-mint shadow-chunk-sm -translate-y-0.5' : 'bg-white hover:bg-cream'
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

function PlacementOption({ active, onClick, label, hint, preview }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-2xl border-2 border-ink p-2 text-left transition ${
        active ? 'bg-candy-mint shadow-chunk-sm -translate-y-0.5' : 'bg-white hover:bg-cream'
      }`}
    >
      <div className="h-16 rounded-lg border-2 border-ink bg-cream/60 mb-2 overflow-hidden">
        {preview}
      </div>
      <div className="font-display font-bold text-sm leading-tight">{label}</div>
      <div className="text-[11px] text-ink/60 leading-tight">{hint}</div>
      {active && (
        <span className="absolute top-2 right-2 w-5 h-5 rounded-full border-2 border-ink bg-ink text-cream grid place-items-center text-[10px] font-bold">✓</span>
      )}
    </button>
  )
}

function CenterPreview() {
  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex-1 bg-candy-pink/70 border-b-2 border-ink" />
      <div className="flex-1 bg-candy-mint/70" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-ink bg-white" />
    </div>
  )
}

function TopPreview() {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="h-1/3 bg-white border-b-2 border-ink grid place-items-center">
        <div className="w-8 h-2 rounded-sm bg-ink/60" />
      </div>
      <div className="flex-1 bg-candy-yellow/70 border-b-2 border-ink" />
      <div className="flex-1 bg-candy-blue/60" />
    </div>
  )
}

function MenuPreview() {
  return (
    <div className="w-full h-full grid grid-cols-2 gap-1 p-1">
      <div className="rounded-md border-2 border-ink bg-white grid place-items-center">
        <div className="w-3 h-3 rounded-full bg-ink/40" />
      </div>
      <div className="rounded-md border-2 border-ink bg-white" />
      <div className="rounded-md border-2 border-ink bg-white" />
      <div className="rounded-md border-2 border-ink bg-white" />
    </div>
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

  const dialogs = useDialogs()

  const rotate = async () => {
    const ok = await dialogs.confirm({
      title: 'Regenerate link?',
      message: 'A new public link will be created. The current one will stop working immediately.',
      confirmLabel: 'Regenerate',
      tone: 'danger',
    })
    if (!ok) return
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
    <div>
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
            <div className="flex flex-col sm:flex-row gap-3 pt-2 pr-2 pb-2">
              <div className="shrink-0 self-center sm:self-start p-2.5 rounded-2xl border-2 border-ink bg-white shadow-chunk-sm">
                <QRCodeSVG
                  value={url}
                  size={132}
                  bgColor="#ffffff"
                  fgColor="#0F0F12"
                  level="M"
                  marginSize={0}
                />
                <p className="mt-1.5 text-center text-[11px] font-semibold text-ink/60">Scan to watch</p>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <input
                  readOnly
                  value={url}
                  onFocus={e => e.target.select()}
                  className="input-chunk font-mono text-sm bg-candy-yellow/40"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={copy} className="btn-chunk bg-white flex-1">
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button type="button" onClick={rotate} disabled={busy} className="btn-chunk bg-candy-pink text-white flex-1 disabled:opacity-60">
                    Regenerate
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {err && <div className="mt-2 px-3 py-2 rounded-xl border-2 border-ink bg-candy-pink/30 text-sm">{err}</div>}
    </div>
  )
}

function MembersSection({ gameId }) {
  const [members, setMembers] = useState([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const load = async () => {
    const { data: mems } = await supabase.from('game_members')
      .select('user_id, created_at, profiles:game_members_user_id_profiles_fkey (email, display_name)')
      .eq('game_id', gameId)
      .order('created_at')
    setMembers(mems ?? [])
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

  const dialogs = useDialogs()
  const remove = async (userId, label) => {
    const ok = await dialogs.confirm({
      title: 'Remove collaborator?',
      message: `${label ?? 'This collaborator'} will lose access to the game. You can re-invite them later.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('game_members').delete()
      .eq('game_id', gameId).eq('user_id', userId)
    if (error) setErr(error.message)
  }

  return (
    <div className="mt-6 pt-6 border-t-2 border-dashed border-ink/20">
      <label className="block text-sm font-semibold">People you've invited</label>
      <p className="text-xs text-ink/60 mb-2">They can see and edit this game. Remove them any time.</p>

      <div className="space-y-2 mb-3">
        {members.length === 0 ? (
          <div className="px-3 py-3 rounded-2xl border-2 border-dashed border-ink/20 text-sm text-ink/60 text-center">
            You haven't invited anyone yet.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {members.map(m => {
              const name = m.profiles?.display_name?.trim()
              const email = m.profiles?.email
              const primary = name || email || '…'
              const initial = (name || email || '?')[0]?.toUpperCase()
              return (
                <motion.div
                  key={m.user_id}
                  layout
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 8 }}
                  className="flex items-center gap-2 p-2 rounded-2xl border-2 border-ink bg-white"
                >
                  <div className="w-9 h-9 rounded-xl border-2 border-ink bg-candy-mint grid place-items-center font-bold">
                    {initial}
                  </div>
                  <div className="flex-1 truncate">
                    <div className="font-semibold truncate">{primary}</div>
                    {name && email && (
                      <div className="text-xs text-ink/60 truncate">{email}</div>
                    )}
                  </div>
                  <button
                    onClick={() => remove(m.user_id, primary)}
                    className="px-3 py-1.5 rounded-xl border-2 border-ink bg-white hover:bg-candy-pink hover:text-white text-sm font-semibold transition"
                  >Remove</button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
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
  const wrapRef = useRef(null)
  const customRef = useRef(null)
  const [pickingCustom, setPickingCustom] = useState(false)
  const [hexDraft, setHexDraft] = useState(value ?? '')

  const sameHex = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
  const isCustom = !!value && !TEAM_PALETTE.some(c => sameHex(c, value))

  useEffect(() => { setHexDraft(value ?? '') }, [value])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (pickingCustom) return
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, pickingCustom])

  const openNative = () => {
    setPickingCustom(true)
    customRef.current?.click()
    setTimeout(() => setPickingCustom(false), 400)
  }

  // Commit live as the native picker reports changes. The hidden input is
  // sr-only and never receives focus (so blur never fires), so we can't defer
  // the commit until close — just apply each change directly.
  const onNativeInput = (e) => {
    const c = e.target.value
    if (c && !sameHex(c, value)) onChange(c)
  }

  const commitHex = (raw) => {
    const v = raw.trim()
    const m = /^#?([0-9a-fA-F]{6})$/.exec(v)
    if (!m) { setHexDraft(value ?? ''); return }
    onChange(`#${m[1].toUpperCase()}`)
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-10 h-10 rounded-xl border-2 border-ink"
        style={{ background: value }}
        title="Change color"
        aria-haspopup="true"
        aria-expanded={open}
      />
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="absolute left-0 top-12 z-50 p-3 rounded-2xl border-2 border-ink bg-white shadow-chunk w-[15.5rem]"
        >
          <div className="grid grid-cols-5 gap-2">
            {TEAM_PALETTE.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false) }}
                className={`w-10 h-10 rounded-lg border-2 border-ink transition-transform hover:-translate-y-0.5 ${sameHex(value, c) ? 'ring-2 ring-ink ring-offset-2 ring-offset-white' : ''}`}
                style={{ background: c }}
                aria-label={`Pick ${c}`}
              />
            ))}
          </div>

          <div className="mt-3 pt-3 border-t-2 border-dashed border-ink/20">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink/60 mb-1.5">Custom</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openNative}
                className={`relative w-10 h-10 rounded-lg border-2 border-ink overflow-hidden shrink-0 transition-transform hover:-translate-y-0.5 ${isCustom ? 'ring-2 ring-ink ring-offset-2 ring-offset-white' : ''}`}
                style={isCustom ? { background: value } : { background: 'conic-gradient(from 90deg, #FF4FA3, #FFD93D, #5EE2C1, #4D7CFF, #9B6DFF, #FF4FA3)' }}
                title="Pick any color"
                aria-label="Pick any color"
              >
                {!isCustom && (
                  <span className="absolute inset-0 grid place-items-center text-white font-display font-bold">+</span>
                )}
              </button>
              <input
                ref={customRef}
                type="color"
                defaultValue={isCustom ? value : '#FF4FA3'}
                onChange={onNativeInput}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
              />
              <input
                type="text"
                value={hexDraft}
                onChange={e => setHexDraft(e.target.value)}
                onBlur={e => commitHex(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                placeholder="#RRGGBB"
                spellCheck={false}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border-2 border-ink bg-white font-mono text-xs uppercase tracking-wider outline-none focus:shadow-chunk-sm focus:-translate-y-0.5 transition"
                aria-label="Hex color"
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function tmp() { return 'tmp-' + Math.random().toString(36).slice(2, 9) }

function PresetsSection({ presets, onChange }) {
  // Map the integer array onto stable {id, value} items so each chip
  // keeps its key across edits/dupes. Re-sync if the prop changes from
  // the outside (e.g. Reset, undo, realtime).
  const idSeed = useRef(0)
  const [items, setItems] = useState(() =>
    presets.map(v => ({ id: `p-${idSeed.current++}`, value: v }))
  )

  useEffect(() => {
    setItems(prev => {
      if (prev.length === presets.length && prev.every((it, i) => it.value === presets[i])) {
        return prev
      }
      return presets.map(v => ({ id: `p-${idSeed.current++}`, value: v }))
    })
  }, [presets])

  const push = (nextItems) => {
    setItems(nextItems)
    onChange(nextItems.map(it => it.value))
  }

  const full = items.length >= MAX_PRESETS
  const isDefault = items.length === DEFAULT_PRESETS.length
    && items.every((it, i) => it.value === DEFAULT_PRESETS[i])

  const handleAdd = (v) => {
    if (full) return
    push([...items, { id: `p-${idSeed.current++}`, value: v }])
  }
  const handleRemove = (id) => push(items.filter(it => it.id !== id))
  const handleUpdate = (id, v) => {
    const idx = items.findIndex(it => it.id === id)
    if (idx === -1 || items[idx].value === v) return
    const next = items.slice()
    next[idx] = { ...next[idx], value: v }
    push(next)
  }
  const handleMove = (id, dir) => {
    const idx = items.findIndex(it => it.id === id)
    if (idx === -1) return
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    const next = items.slice()
    ;[next[idx], next[j]] = [next[j], next[idx]]
    push(next)
  }
  const handleReset = () =>
    push(DEFAULT_PRESETS.map(v => ({ id: `p-${idSeed.current++}`, value: v })))

  return (
    <div className="p-3 rounded-2xl border-2 border-dashed border-ink/20">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <label className="block text-sm font-semibold">Quick point buttons</label>
        {!isDefault && (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-semibold text-ink/70 hover:text-ink underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink shrink-0"
            title="Reset to ±5, ±10, ±15"
          >
            Reset
          </button>
        )}
      </div>
      <p className="text-xs text-ink/60 mb-3">
        Shown in the popup when you tap a team. Type any whole number — use a minus sign for penalties. Use the ◀ ▶ arrows to rearrange.
      </p>

      <div className="flex flex-wrap gap-2">
        <AnimatePresence initial={false}>
          {items.map((item, i) => (
            <PresetChip
              key={item.id}
              item={item}
              isFirst={i === 0}
              isLast={i === items.length - 1}
              onCommit={(v) => handleUpdate(item.id, v)}
              onRemove={() => handleRemove(item.id)}
              onMove={(dir) => handleMove(item.id, dir)}
            />
          ))}
        </AnimatePresence>

        <motion.button
          type="button"
          layout
          onClick={() => handleAdd(5)}
          disabled={full}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border-2 border-dashed border-ink/40 bg-candy-mint/30 text-ink font-display font-semibold text-sm hover:border-ink hover:bg-candy-mint transition disabled:opacity-40 disabled:hover:border-ink/40 disabled:hover:bg-candy-mint/30"
          title="Add a reward preset"
        >
          <span className="leading-none">＋</span> reward
        </motion.button>
        <motion.button
          type="button"
          layout
          onClick={() => handleAdd(-5)}
          disabled={full}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border-2 border-dashed border-ink/40 bg-candy-pink/30 text-ink font-display font-semibold text-sm hover:border-ink hover:bg-candy-pink hover:text-white transition disabled:opacity-40 disabled:hover:border-ink/40 disabled:hover:bg-candy-pink/30 disabled:hover:text-ink"
          title="Add a penalty preset"
        >
          <span className="leading-none">−</span> penalty
        </motion.button>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-ink/60 mt-3">
          No quick buttons — players will still see the custom amount field in the popup.
        </p>
      )}
      {full && (
        <p className="text-xs text-ink/60 mt-3">Maximum of {MAX_PRESETS} presets reached.</p>
      )}
    </div>
  )
}

function PresetChip({ item, isFirst, isLast, onCommit, onRemove, onMove }) {
  const { value } = item
  const [draft, setDraft] = useState(String(value))

  useEffect(() => { setDraft(String(value)) }, [value])

  const parsed = parseInt(draft, 10)
  const previewPositive = Number.isFinite(parsed) ? parsed > 0 : value > 0
  const bg = previewPositive ? 'bg-candy-mint text-ink' : 'bg-candy-pink text-white'
  const divider = previewPositive ? 'border-ink/20' : 'border-white/30'
  const ctrlHover = previewPositive ? 'hover:bg-ink/10' : 'hover:bg-white/20'
  const xHover = previewPositive ? 'hover:bg-ink/10' : 'hover:bg-white/20'

  const commit = () => {
    const n = parseInt(draft, 10)
    if (!Number.isFinite(n) || n === 0) {
      setDraft(String(value)) // revert silently
      return
    }
    onCommit(n)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{
        layout: { type: 'spring', stiffness: 380, damping: 28 },
        default: { type: 'spring', stiffness: 320, damping: 22 },
      }}
      className={`flex items-stretch rounded-xl border-2 border-ink overflow-hidden font-display font-bold shadow-chunk-sm select-none ${bg}`}
    >
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={isFirst}
        className={`px-1.5 flex items-center justify-center border-r-2 ${divider} ${ctrlHover} transition disabled:opacity-30 disabled:hover:bg-transparent`}
        title="Move left"
        aria-label="Move left"
      >
        <ChevronIcon dir="left" />
      </button>
      <input
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur() }
        }}
        className="w-16 px-2 py-1.5 bg-transparent outline-none text-center text-lg tabular-nums no-spin"
        aria-label="Preset value"
      />
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={isLast}
        className={`px-1.5 flex items-center justify-center border-l-2 ${divider} ${ctrlHover} transition disabled:opacity-30 disabled:hover:bg-transparent`}
        title="Move right"
        aria-label="Move right"
      >
        <ChevronIcon dir="right" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className={`px-2 border-l-2 ${divider} ${xHover} text-sm transition`}
        title="Remove preset"
        aria-label="Remove preset"
      >×</button>
    </motion.div>
  )
}

function ChevronIcon({ dir }) {
  const d = dir === 'left' ? 'M7 2 L3 5 L7 8' : 'M3 2 L7 5 L3 8'
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="opacity-80">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
