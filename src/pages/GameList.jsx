import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import GameEditor from '../components/GameEditor.jsx'
import { TEAM_PALETTE } from '../lib/colors.js'
import { useDialogs } from '../components/Dialogs.jsx'

export default function GameList() {
  const { user, signOut } = useAuth()
  const dialogs = useDialogs()
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    const { data, error } = await supabase
      .from('games')
      .select('id, name, user_id, is_public, public_token, created_at, updated_at, teams (id, name, color)')
      .order('updated_at', { ascending: false })
    if (!error) setGames(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Realtime: anything affecting which games we see/care about → reload.
  useEffect(() => {
    const channel = supabase.channel('games-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' },        load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' },        load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_members' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleSignOut = async () => {
    const ok = await dialogs.confirm({
      title: 'Sign out?',
      message: 'You can sign back in any time.',
      confirmLabel: 'Sign out',
      tone: 'neutral',
    })
    if (ok) await signOut()
  }

  const remove = async (game) => {
    const ok = await dialogs.confirm({
      title: 'Delete game?',
      message: `"${game.name}" and all its teams, scores, and logs will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('games').delete().eq('id', game.id)
    if (error) await dialogs.alert({ title: 'Could not delete', message: error.message })
  }

  const leave = async (game) => {
    const ok = await dialogs.confirm({
      title: 'Leave game?',
      message: `You'll lose access to "${game.name}". The owner can re-invite you later.`,
      confirmLabel: 'Leave',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('game_members').delete()
      .eq('game_id', game.id).eq('user_id', user.id)
    if (error) await dialogs.alert({ title: 'Could not leave', message: error.message })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full bg-cream bg-grid"
    >
      <header className="px-4 md:px-10 py-4 md:py-6 flex items-center justify-between gap-3 border-b-2 border-ink bg-cream/80 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-2xl bg-candy-yellow border-2 border-ink grid place-items-center font-display font-bold shrink-0">P!</div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-xl md:text-2xl leading-none">Pointification</h1>
            <p className="text-ink/60 text-xs truncate">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <NavLink
            to="/account"
            aria-label="Account"
            title="Account"
            className="btn-chunk bg-white text-sm p-2 md:px-4 md:py-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="md:hidden"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
            <span className="hidden md:inline">Account</span>
          </NavLink>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="btn-chunk bg-white text-sm p-2 md:px-4 md:py-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="md:hidden"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-10 py-6 md:py-10">
        {loading ? (
          <SkeletonGrid />
        ) : games.length === 0 ? (
          <EmptyState onCreate={() => setEditing('new')} />
        ) : (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
              {games.map((g, i) => {
                const isOwner = g.user_id === user?.id
                return (
                  <GameCard
                    key={g.id}
                    game={g}
                    i={i}
                    isOwner={isOwner}
                    onEdit={() => setEditing(g)}
                    onDelete={() => isOwner ? remove(g) : leave(g)}
                  />
                )
              })}
              <NewGameCard key="__new" i={games.length} onCreate={() => setEditing('new')} />
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      <AnimatePresence>
        {editing && (
          <GameEditor
            initial={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load() }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function GameCard({ game, i, isOwner, onEdit, onDelete }) {
  const accent = TEAM_PALETTE[i % TEAM_PALETTE.length]
  const teams = game.teams ?? []
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20, delay: i * 0.03 }}
      whileHover={{ y: -4, rotate: -0.5 }}
      className="card-chunk overflow-hidden group"
    >
      <Link to={`/game/${game.id}`} className="block">
        <div
          className="h-28 border-b-2 border-ink relative overflow-hidden"
          style={{ background: accent }}
        >
          <div className="absolute inset-0 bg-dots opacity-30" />
          <div className="absolute bottom-2 right-3 font-display text-5xl font-bold text-ink/15">
            {teams.length || '0'}
          </div>
          {!isOwner && (
            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full border-2 border-ink bg-white text-xs font-bold uppercase tracking-wider">
              shared
            </span>
          )}
        </div>
        <div className="p-5">
          <h3 className="font-display text-2xl font-bold leading-tight truncate">{game.name}</h3>
          <p className="text-ink/60 text-sm mt-1">
            {teams.length} {teams.length === 1 ? 'team' : 'teams'}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3 min-h-[28px]">
            {teams.slice(0, 6).map(t => (
              <span
                key={t.id}
                className="px-2.5 py-1 rounded-full border-2 border-ink text-xs font-semibold"
                style={{ background: t.color }}
              >
                {t.name}
              </span>
            ))}
            {teams.length > 6 && (
              <span className="px-2.5 py-1 rounded-full border-2 border-ink text-xs font-semibold bg-white">
                +{teams.length - 6}
              </span>
            )}
          </div>
        </div>
      </Link>
      <div className="flex border-t-2 border-ink">
        <button onClick={onEdit} className="flex-1 py-2.5 font-display font-semibold hover:bg-candy-yellow transition">Edit</button>
        <div className="w-[2px] bg-ink" />
        <Link to={`/game/${game.id}/log`} className="flex-1 py-2.5 font-display font-semibold text-center hover:bg-candy-mint transition">Log</Link>
        <div className="w-[2px] bg-ink" />
        <button onClick={onDelete} className="flex-1 py-2.5 font-display font-semibold hover:bg-candy-pink hover:text-white transition">
          {isOwner ? 'Delete' : 'Leave'}
        </button>
      </div>
    </motion.div>
  )
}

function NewGameCard({ i, onCreate }) {
  return (
    <motion.button
      layout
      onClick={onCreate}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20, delay: i * 0.03 }}
      whileHover={{ y: -4, rotate: -0.5 }}
      className="card-chunk overflow-hidden group min-h-[260px] flex flex-col items-center justify-center text-center p-8 bg-candy-mint/40 hover:bg-candy-mint transition"
    >
      <div className="w-14 h-14 rounded-2xl bg-white border-2 border-ink grid place-items-center font-display text-3xl font-bold mb-3">+</div>
      <h3 className="font-display text-2xl font-bold leading-tight">New game</h3>
      <p className="text-ink/60 text-sm mt-1">Start tracking points</p>
    </motion.button>
  )
}

function EmptyState({ onCreate }) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="card-chunk p-12 text-center"
    >
      <div className="text-6xl mb-3">🎲</div>
      <h3 className="font-display text-3xl font-bold">No games yet</h3>
      <p className="text-ink/60 mt-2 mb-6">Create your first game and start racking up points.</p>
      <button onClick={onCreate} className="btn-chunk bg-candy-pink text-white text-lg">+ New game</button>
    </motion.div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card-chunk h-64 animate-pulse" />
      ))}
    </div>
  )
}
