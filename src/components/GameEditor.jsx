import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { TEAM_PALETTE, nextColor } from '../lib/colors.js'

// initial: null for new, or full game object (with teams)
export default function GameEditor({ initial, onClose, onSaved }) {
  const { user } = useAuth()
  const isEdit = !!initial
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

      // Sync teams
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

  // close on Esc
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
            <h2 className="font-display text-3xl font-bold">{isEdit ? 'Edit game' : 'New game'}</h2>
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
