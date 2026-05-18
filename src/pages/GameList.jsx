import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, logoUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import GameEditor from '../components/GameEditor.jsx'
import { TEAM_PALETTE } from '../lib/colors.js'
import { useDialogs } from '../components/Dialogs.jsx'

const FILTERS = [
  { id: 'all',      label: 'All',             icon: AllIcon,      accent: '#FFD93D' },
  { id: 'mine',     label: 'My games',        icon: CrownIcon,    accent: '#5EE2C1' },
  { id: 'shared',   label: 'Shared with me',  icon: PeopleIcon,   accent: '#4D7CFF' },
  { id: 'archive',  label: 'Archive',         icon: ArchiveIcon,  accent: '#9B6DFF' },
]

export default function GameList() {
  const { user, signOut } = useAuth()
  const dialogs = useDialogs()
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('all')

  const load = async () => {
    const { data, error } = await supabase
      .from('games')
      .select('id, name, user_id, is_public, public_token, archived_at, created_at, updated_at, logo_path, logo_placement, logo_shape, logo_scale, teams (id, name, color)')
      .order('updated_at', { ascending: false })
    if (!error) setGames(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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

  const archive = async (game) => {
    const archived = !!game.archived_at
    const { error } = await supabase.from('games')
      .update({ archived_at: archived ? null : new Date().toISOString() })
      .eq('id', game.id)
    if (error) await dialogs.alert({ title: archived ? 'Could not unarchive' : 'Could not archive', message: error.message })
  }

  const remove = async (game) => {
    const ok = await dialogs.confirm({
      title: 'Delete game?',
      message: `"${game.name}" and all its teams, scores, and logs will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    // Best-effort: clean up any logo objects sitting at {user_id}/{game_id}/* before
    // the row goes away (storage RLS requires the game to still exist for the
    // ownership check, so do it first).
    if (user?.id) {
      const prefix = `${user.id}/${game.id}`
      const { data: files } = await supabase.storage.from('game-logos').list(prefix, { limit: 100 })
      if (files?.length) {
        await supabase.storage.from('game-logos').remove(files.map(f => `${prefix}/${f.name}`))
      }
    }
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
    const { data, error } = await supabase.from('game_members').delete()
      .eq('game_id', game.id).eq('user_id', user.id)
      .select('user_id')
    if (error) return dialogs.alert({ title: 'Could not leave', message: error.message })
    if (!data?.length) {
      return dialogs.alert({
        title: 'Could not leave',
        message: 'The server refused to remove your membership. Please try again or contact the game owner.',
      })
    }
    setGames(gs => gs.filter(x => x.id !== game.id))
  }

  const counts = useMemo(() => {
    const c = { all: 0, mine: 0, shared: 0, archive: 0 }
    for (const g of games) {
      const isOwner = g.user_id === user?.id
      if (g.archived_at) { c.archive += 1; continue }
      c.all += 1
      if (isOwner) c.mine += 1
      else c.shared += 1
    }
    return c
  }, [games, user?.id])

  const visible = useMemo(() => {
    return games.filter(g => {
      const isOwner = g.user_id === user?.id
      switch (filter) {
        case 'mine':    return !g.archived_at && isOwner
        case 'shared':  return !g.archived_at && !isOwner
        case 'archive': return !!g.archived_at
        case 'all':
        default:        return !g.archived_at
      }
    })
  }, [games, filter, user?.id])

  const allowCreate = filter === 'all' || filter === 'mine'

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full bg-cream bg-grid"
    >
      <header className="px-4 md:px-10 py-4 md:py-6 flex items-center justify-between gap-3 border-b-2 border-ink bg-cream/80 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
          <img src="/pointification.png" alt="Pointification" className="w-9 h-9 md:w-10 md:h-10 shrink-0 object-contain" />
          <div className="min-w-0">
            <h1 className="font-display font-bold text-xl md:text-2xl leading-none">Pointification</h1>
            <p className="text-ink/60 text-xs truncate">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SupportMenu />
          <NavLink
            to="/account"
            aria-label="Account"
            title="Account"
            className="btn-chunk bg-white text-sm p-2 md:px-4 md:py-2 inline-flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
            <span className="hidden md:inline">Account</span>
          </NavLink>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="btn-chunk bg-white text-sm p-2 md:px-4 md:py-2 inline-flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-10 py-6 md:py-10 flex flex-col md:flex-row gap-6 md:gap-8">
        <Sidebar
          filter={filter}
          onChange={setFilter}
          counts={counts}
        />

        <main className="flex-1 min-w-0">
          {loading ? (
            <SkeletonGrid />
          ) : (
            <>
              <FilterHeader filter={filter} count={visible.length} />

              {visible.length === 0 && !allowCreate ? (
                <EmptyForFilter filter={filter} />
              ) : visible.length === 0 && allowCreate ? (
                <EmptyState filter={filter} onCreate={() => setEditing('new')} />
              ) : (
                <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <AnimatePresence mode="popLayout">
                    {visible.map((g, i) => {
                      const isOwner = g.user_id === user?.id
                      return (
                        <GameCard
                          key={g.id}
                          game={g}
                          i={i}
                          isOwner={isOwner}
                          onEdit={() => setEditing(g)}
                          onArchive={isOwner ? () => archive(g) : null}
                          onDelete={() => isOwner ? remove(g) : leave(g)}
                        />
                      )
                    })}
                    {allowCreate && (
                      <NewGameCard key="__new" i={visible.length} onCreate={() => setEditing('new')} />
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </>
          )}
        </main>
      </div>

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

function Sidebar({ filter, onChange, counts }) {
  return (
    <>
      {/* Mobile: horizontal scrollable pills */}
      <nav className="md:hidden -mx-4 px-4 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 pb-2 w-max">
          {FILTERS.map(f => {
            const active = f.id === filter
            const Icon = f.icon
            return (
              <button
                key={f.id}
                onClick={() => onChange(f.id)}
                style={active ? { background: f.accent } : undefined}
                className={`flex items-center gap-2 px-3 py-2 rounded-2xl border-2 border-ink font-display font-semibold text-sm transition text-ink ${
                  active ? 'shadow-chunk-sm' : 'bg-white hover:bg-candy-yellow'
                }`}
              >
                <span
                  className="w-6 h-6 rounded-lg border-2 border-ink grid place-items-center bg-white"
                >
                  <Icon />
                </span>
                <span>{f.label}</span>
                <span className="min-w-[22px] text-center px-1.5 py-0.5 rounded-md text-xs font-bold border-2 border-ink bg-white">
                  {counts[f.id]}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Desktop: sticky sidebar card */}
      <aside className="hidden md:block w-56 shrink-0">
        <div className="card-chunk overflow-hidden sticky top-28">
          <div className="px-4 py-3 border-b-2 border-ink bg-cream">
            <h2 className="font-display font-bold text-lg leading-none">Filter</h2>
          </div>
          <ul className="p-2 space-y-1">
            {FILTERS.map(f => {
              const active = f.id === filter
              const Icon = f.icon
              return (
                <li key={f.id}>
                  <button
                    onClick={() => onChange(f.id)}
                    style={active ? { background: f.accent } : undefined}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl border-2 font-display font-semibold transition relative text-ink ${
                      active
                        ? 'border-ink shadow-chunk-sm'
                        : 'border-transparent hover:border-ink hover:bg-cream'
                    }`}
                  >
                    <span
                      className="w-8 h-8 rounded-lg border-2 border-ink grid place-items-center shrink-0 bg-white"
                    >
                      <Icon />
                    </span>
                    <span className="flex-1 text-left truncate">{f.label}</span>
                    <span
                      className="min-w-[26px] text-center px-1.5 py-0.5 rounded-md text-xs font-bold border-2 border-ink bg-white"
                    >
                      {counts[f.id]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </aside>
    </>
  )
}

const DONATE_URL = import.meta.env.VITE_DONATE_URL

function SupportMenu() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
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
  }, [open])

  const refer = async () => {
    const url = window.location.origin
    const text = `Try Pointification — a simple, fun scoreboard for quiz nights and family games. ${url}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Pointification', text, url })
        setOpen(false)
      } catch {/* user dismissed share sheet */}
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => { setCopied(false); setOpen(false) }, 1200)
    } catch {
      setOpen(false)
    }
  }

  const donate = () => {
    window.open(DONATE_URL, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Support"
        title="Support"
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-chunk bg-white text-sm p-2 md:px-4 md:py-2 inline-flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span className="hidden md:inline">Support</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            key="support-menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="menu"
            className="absolute right-0 top-12 z-50 p-1.5 rounded-2xl border-2 border-ink bg-white shadow-chunk w-56"
          >
            <button
              type="button"
              role="menuitem"
              onClick={refer}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-cream font-semibold text-sm inline-flex items-center gap-2.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              {copied ? 'Copied!' : 'Refer a friend'}
            </button>
            {DONATE_URL && (
              <button
                type="button"
                role="menuitem"
                onClick={donate}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-cream font-semibold text-sm inline-flex items-center gap-2.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                Donate
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FilterHeader({ filter, count }) {
  const f = FILTERS.find(x => x.id === filter)
  if (!f) return null
  const label = f.id === 'all' ? 'Your games' : f.label
  return (
    <motion.div
      key={filter}
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-baseline gap-3 mb-4"
    >
      <h2 className="font-display font-bold text-2xl md:text-3xl leading-none">{label}</h2>
      <span className="text-ink/50 font-semibold">{count}</span>
    </motion.div>
  )
}

function EmptyForFilter({ filter }) {
  const map = {
    shared: {
      emoji: '🤝',
      title: 'No shared games yet',
      body: 'When someone invites you to a game, it shows up here.',
    },
    archive: {
      emoji: '📦',
      title: 'Nothing archived',
      body: 'Archive a game from its menu and it lands here, safe and out of the way.',
    },
  }
  const s = map[filter] ?? map.shared
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="card-chunk p-10 md:p-12 text-center"
    >
      <div className="text-5xl md:text-6xl mb-3">{s.emoji}</div>
      <h3 className="font-display text-2xl md:text-3xl font-bold">{s.title}</h3>
      <p className="text-ink/60 mt-2 max-w-sm mx-auto">{s.body}</p>
    </motion.div>
  )
}

function GameCard({ game, i, isOwner, onEdit, onArchive, onDelete }) {
  const accent = TEAM_PALETTE[i % TEAM_PALETTE.length]
  const teams = game.teams ?? []
  const isArchived = !!game.archived_at
  const logo = game.logo_path ? logoUrl(game.logo_path) : null
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20, delay: i * 0.03 }}
      whileHover={{ y: -4, rotate: -0.5 }}
      className={`card-chunk overflow-hidden group flex flex-col h-full ${isArchived ? 'opacity-70' : ''}`}
    >
      <Link to={`/game/${game.id}`} className="flex flex-col flex-1">
        <div
          className="h-28 border-b-2 border-ink relative overflow-hidden"
          style={{ background: accent }}
        >
          <div className="absolute inset-0 bg-dots opacity-30" />
          <div className="absolute bottom-2 right-3 font-display text-5xl font-bold text-ink/15">
            {teams.length || '0'}
          </div>
          <div className={`absolute top-3 ${logo ? 'left-[5.25rem]' : 'left-3'} flex gap-1.5`}>
            {!isOwner && (
              <span className="px-2.5 py-1 rounded-full border-2 border-ink bg-white text-xs font-bold uppercase tracking-wider">
                shared
              </span>
            )}
            {isArchived && (
              <span className="px-2.5 py-1 rounded-full border-2 border-ink bg-ink text-white text-xs font-bold uppercase tracking-wider">
                archived
              </span>
            )}
          </div>
          {logo && (
            <div className="absolute top-2 left-2 w-16 h-16 rounded-2xl border-2 border-ink bg-white shadow-chunk-sm grid place-items-center overflow-hidden -rotate-3">
              <img src={logo} alt="" className="w-[78%] h-[78%] object-contain" />
            </div>
          )}
        </div>
        <div className="p-5 flex-1">
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
        <Link to={`/game/${game.id}/log`} className="flex-1 py-2.5 font-display font-semibold text-center hover:bg-candy-mint transition">Details</Link>
        {onArchive && (
          <>
            <div className="w-[2px] bg-ink" />
            <button onClick={onArchive} className="flex-1 py-2.5 font-display font-semibold hover:bg-candy-blue hover:text-white transition">
              {isArchived ? 'Unarchive' : 'Archive'}
            </button>
          </>
        )}
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

function EmptyState({ filter, onCreate }) {
  const title = filter === 'mine' ? "You don't own any games yet" : 'No games yet'
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="card-chunk p-12 text-center"
    >
      <div className="text-6xl mb-3">🎲</div>
      <h3 className="font-display text-3xl font-bold">{title}</h3>
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

/* --- icons --- */

function AllIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
function CrownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18h18" />
      <path d="M3 7l5 4 4-7 4 7 5-4-2 11H5L3 7z" />
    </svg>
  )
}
function PeopleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 20a5 5 0 0 1 7 0" />
    </svg>
  )
}
function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </svg>
  )
}
