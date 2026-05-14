import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import AnimatedNumber from '../components/AnimatedNumber.jsx'
import PointPopup from '../components/PointPopup.jsx'

export default function GameScreen() {
  const { id } = useParams()
  const nav = useNavigate()
  const [game, setGame] = useState(null)
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null) // team id with popup open
  const [flash, setFlash] = useState({})     // { [teamId]: +n or -n }
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [{ data: g }, { data: t }] = await Promise.all([
      supabase.from('games').select('id, name').eq('id', id).single(),
      supabase.from('teams').select('id, name, color, score, position').eq('game_id', id).order('position')
    ])
    setGame(g ?? null)
    setTeams(t ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // Realtime: keep scores in sync if changed elsewhere
  useEffect(() => {
    const channel = supabase.channel(`game:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams', filter: `game_id=eq.${id}` }, (payload) => {
        setTeams(prev => prev.map(t => t.id === payload.new.id ? { ...t, score: payload.new.score } : t))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  const applyDelta = async (teamId, delta) => {
    setBusy(true)
    // optimistic
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, score: t.score + delta } : t))
    setFlash(f => ({ ...f, [teamId]: (f[teamId] ?? 0) + 1 }))
    const { error } = await supabase.rpc('apply_point_change', { p_team_id: teamId, p_delta: delta })
    if (error) {
      // revert on failure
      setTeams(prev => prev.map(t => t.id === teamId ? { ...t, score: t.score - delta } : t))
      alert('Could not apply: ' + error.message)
    }
    setBusy(false)
  }

  if (loading) {
    return <div className="h-full grid place-items-center bg-cream font-display text-3xl animate-pulse">loading…</div>
  }
  if (!game) {
    return (
      <div className="h-full grid place-items-center bg-cream">
        <div className="card-chunk p-8 text-center">
          <h2 className="font-display text-3xl font-bold">Game not found</h2>
          <button onClick={() => nav('/')} className="btn-chunk bg-candy-mint mt-4">← Back</button>
        </div>
      </div>
    )
  }

  const activeTeam = teams.find(t => t.id === active)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex flex-col bg-ink">
      {/* top bar */}
      <header className="shrink-0 px-4 md:px-6 py-3 flex items-center justify-between bg-cream border-b-2 border-ink z-10">
        <button onClick={() => nav('/')} className="btn-chunk bg-white text-sm py-2 px-3">← Games</button>
        <h1 className="font-display font-bold text-xl md:text-2xl truncate px-3">{game.name}</h1>
        <div className="text-sm text-ink/60 hidden md:block">{teams.length} {teams.length === 1 ? 'team' : 'teams'}</div>
      </header>

      {/* fill remaining */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {teams.length === 0 ? (
          <div className="flex-1 grid place-items-center text-cream/70 font-display text-xl">No teams. Edit the game to add some.</div>
        ) : teams.map((t, i) => (
          <TeamRow
            key={t.id}
            team={t}
            index={i}
            flashKey={flash[t.id] ?? 0}
            onClick={() => setActive(t.id)}
          />
        ))}
      </div>

      <AnimatePresence>
        {activeTeam && (
          <PointPopup
            team={activeTeam}
            busy={busy}
            onApply={async (n) => { await applyDelta(activeTeam.id, n) }}
            onClose={() => setActive(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function TeamRow({ team, index, flashKey, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, x: index % 2 === 0 ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 140, damping: 18, delay: index * 0.05 }}
      whileTap={{ scale: 0.995 }}
      className="relative flex-1 min-h-0 flex items-center justify-between px-6 md:px-12 border-b-2 border-ink last:border-b-0 overflow-hidden text-left"
      style={{ background: team.color }}
    >
      <AnimatePresence>
        {flashKey > 0 && (
          <motion.div
            key={flashKey}
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute inset-0 bg-white pointer-events-none"
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex items-center gap-3 md:gap-5 min-w-0">
        <div className="w-3 md:w-4 h-12 md:h-16 rounded-full bg-ink/15" />
        <h2 className="font-display font-bold text-3xl sm:text-4xl md:text-6xl lg:text-7xl truncate">
          {team.name}
        </h2>
      </div>
      <div className="relative z-10 font-display font-bold text-4xl sm:text-5xl md:text-7xl lg:text-8xl tabular-nums">
        <AnimatedNumber value={team.score} />
      </div>
    </motion.button>
  )
}
