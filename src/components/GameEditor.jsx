import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, logoUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { TEAM_PALETTE, nextColor } from '../lib/colors.js'
import { useDialogs } from './Dialogs.jsx'

// initial: null for new game, or full game object (with teams + user_id)
export default function GameEditor({ initial, onClose, onSaved }) {
  const { user } = useAuth()
  const isEdit = !!initial
  const isOwner = !isEdit || initial.user_id === user?.id
  const instant = isEdit  // every change writes through immediately

  const [name, setName] = useState(initial?.name ?? '')
  const [allowNegative, setAllowNegative] = useState(!!initial?.allow_negative)
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

  useEffect(() => () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview) }, [pendingPreview])

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
    if (!name.trim()) return setErr('Name your game.')
    if (teams.length < 1) return setErr('Add at least one team.')
    if (teams.some(t => !t.name.trim())) return setErr('Every team needs a name.')

    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('create_game', { p_name: name })
      if (error) throw error
      const gameId = data.id
      if (allowNegative) {
        const { error: e2 } = await supabase.from('games')
          .update({ allow_negative: true }).eq('id', gameId)
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
        className="card-chunk w-full md:max-w-2xl max-h-[92vh] overflow-y-auto no-scrollbar"
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
            className="input-chunk mb-4"
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
            <button
              type="button"
              onClick={toggleNegative}
              aria-pressed={allowNegative}
              className={`relative w-14 h-8 rounded-full border-2 border-ink transition-colors ${allowNegative ? 'bg-candy-mint' : 'bg-white'}`}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="absolute top-0.5 w-6 h-6 rounded-full bg-ink"
                style={{ left: allowNegative ? 'calc(100% - 26px)' : '2px' }}
              />
            </button>
          </div>

          {isOwner && (
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
                    disabled={i === 0}
                    className="w-6 h-[18px] rounded-md border-2 border-ink bg-white grid place-items-center text-[10px] leading-none font-bold disabled:opacity-30 hover:bg-candy-yellow transition"
                    title="Move up"
                    aria-label="Move up"
                  >▲</button>
                  <button
                    type="button"
                    onClick={() => moveTeam(i, 1)}
                    disabled={i === teams.length - 1}
                    className="w-6 h-[18px] rounded-md border-2 border-ink bg-white grid place-items-center text-[10px] leading-none font-bold disabled:opacity-30 hover:bg-candy-yellow transition"
                    title="Move down"
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

          {isEdit && isOwner && <SharingSection gameId={initial.id} initialIsPublic={initial.is_public} initialToken={initial.public_token} />}
          {isEdit && isOwner && <MembersSection gameId={initial.id} />}

          {err && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mt-4 px-3 py-2 rounded-xl border-2 border-ink bg-candy-yellow/70 text-sm">
              {err}
            </motion.div>
          )}

          <div className="flex gap-2 mt-6">
            {isEdit ? (
              <button onClick={onClose} className="btn-chunk bg-candy-mint flex-1 text-lg">
                Done
              </button>
            ) : (
              <>
                <button onClick={onClose} className="btn-chunk bg-white flex-1">Cancel</button>
                <button onClick={create} disabled={busy} className="btn-chunk bg-candy-mint flex-1 text-lg disabled:opacity-60">
                  {busy ? 'Creating…' : 'Create game'}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
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
    <div className="mb-6">
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
            <div className="flex flex-col sm:flex-row gap-2 pt-2 pr-2 pb-2">
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
  const [draftColor, setDraftColor] = useState(null)

  const sameHex = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
  const effective = draftColor ?? value
  const isCustom = !!effective && !TEAM_PALETTE.some(c => sameHex(c, effective))

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

  // While the native dialog is open, just preview locally so we don't fire
  // a Supabase update for every micro-change. Commit once on blur (dialog close).
  const onNativeInput = (e) => {
    setDraftColor(e.target.value)
  }
  const onNativeCommit = () => {
    setPickingCustom(false)
    if (draftColor && !sameHex(draftColor, value)) {
      onChange(draftColor)
    }
    setDraftColor(null)
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
                style={isCustom ? { background: effective } : { background: 'conic-gradient(from 90deg, #FF4FA3, #FFD93D, #5EE2C1, #4D7CFF, #9B6DFF, #FF4FA3)' }}
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
                defaultValue={isCustom ? effective : '#FF4FA3'}
                onChange={onNativeInput}
                onBlur={onNativeCommit}
                onFocus={() => setPickingCustom(true)}
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
