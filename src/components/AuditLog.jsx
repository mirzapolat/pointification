import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'

const DAY = 86400 * 1000

/**
 * The audit log: every point change, who made it, when, and whether it was
 * undone. Shared by the signed-in log page and the public share-link log, so
 * it only ever shows names. `showEmail` adds the email for collaborators.
 *
 * @param {{ logs: object[], teams: object[], rounds?: object[], showEmail?: boolean }} props
 */
export default function AuditLog({ logs, teams, rounds = [], showEmail = false }) {
  const [teamFilter, setTeamFilter] = useState('all')
  const [showUndone, setShowUndone] = useState(true)

  const teamMap = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])
  const roundMap = useMemo(
    () => Object.fromEntries(rounds.map((r, i) => [r.id, r.name || `Round ${i + 1}`])),
    [rounds]
  )

  const visible = useMemo(() => logs.filter(l =>
    (teamFilter === 'all' || l.team_id === teamFilter) && (showUndone || !l.undone_at)
  ), [logs, teamFilter, showUndone])

  const groups = useMemo(() => groupByDay(visible), [visible])
  const undoneCount = logs.filter(l => l.undone_at).length

  return (
    <div className="card-chunk overflow-hidden">
      <div className="px-4 md:px-6 py-3 border-b-2 border-ink flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar -my-1 py-1">
          <div className="flex gap-1.5 w-max">
            <FilterChip active={teamFilter === 'all'} onClick={() => setTeamFilter('all')}>All teams</FilterChip>
            {teams.map(t => (
              <FilterChip key={t.id} active={teamFilter === t.id} onClick={() => setTeamFilter(t.id)}>
                <span className="w-2.5 h-2.5 rounded-full border-2 border-ink shrink-0" style={{ background: t.color }} />
                <span className="truncate max-w-[9rem]">{t.name}</span>
              </FilterChip>
            ))}
          </div>
        </div>
        {undoneCount > 0 && (
          <label className="flex items-center gap-2 text-xs font-semibold text-ink/70 shrink-0 cursor-pointer select-none">
            <input type="checkbox" checked={showUndone} onChange={e => setShowUndone(e.target.checked)} className="accent-ink w-4 h-4" />
            Show undone ({undoneCount})
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="p-10 text-center">
          <div className="text-4xl mb-2" aria-hidden="true">📜</div>
          <h3 className="font-display text-lg font-bold">No point changes yet</h3>
        </div>
      ) : groups.map(group => (
        <section key={group.key}>
          <h3 className="sticky top-0 z-10 bg-cream/95 backdrop-blur border-b-2 border-ink/10 px-4 md:px-6 py-2 text-xs font-bold uppercase tracking-wider text-ink/60 flex items-center justify-between">
            <span>{group.label}</span>
            <span className="tabular-nums">{group.items.length}</span>
          </h3>
          <ul className="divide-y-2 divide-ink/5">
            {group.items.map(l => (
              <LogRow
                key={l.id}
                log={l}
                team={teamMap[l.team_id]}
                round={l.round_id ? roundMap[l.round_id] : null}
                showEmail={showEmail}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function LogRow({ log, team, round, showEmail }) {
  const pos = log.delta >= 0
  const undone = !!log.undone_at
  const who = log.user_name?.trim() || (showEmail && log.user_email) || 'Someone'
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
      className={`flex items-center gap-3 px-4 md:px-6 py-3 ${undone ? 'bg-ink/[0.03]' : ''}`}
    >
      <div className={`w-2.5 h-10 rounded-full shrink-0 ${undone ? 'opacity-40' : ''}`} style={{ background: team?.color ?? '#ccc' }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-display font-semibold truncate ${undone ? 'line-through text-ink/50' : ''}`}>
            {team?.name ?? 'Deleted team'}
          </span>
          {round && (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border-2 border-ink/20 text-ink/60">{round}</span>
          )}
        </div>
        <div className="text-xs text-ink/60 truncate">
          <time dateTime={log.created_at} title={new Date(log.created_at).toLocaleString()}>{formatTime(log.created_at)}</time>
          {' · '}
          <span className="font-semibold text-ink/80">{who}</span>
          {showEmail && log.user_name && log.user_email && <span className="text-ink/45"> · {log.user_email}</span>}
        </div>
        {undone && (
          <div className="text-xs text-rose-700 font-semibold truncate mt-0.5">
            Undone{log.undone_by_name ? ` by ${log.undone_by_name}` : ''} · {formatTime(log.undone_at)}
            {!sameDay(log.undone_at, log.created_at) && `, ${formatDate(log.undone_at)}`}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className={`font-display font-bold text-lg tabular-nums leading-none ${undone ? 'text-ink/35 line-through' : pos ? 'text-emerald-700' : 'text-rose-700'}`}>
          {pos ? `+${log.delta}` : `−${Math.abs(log.delta)}`}
        </div>
        <div className="text-[11px] text-ink/50 tabular-nums mt-1">→ {log.new_score}</div>
      </div>
    </motion.li>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border-2 font-display font-semibold text-sm whitespace-nowrap transition ${
        active ? 'border-ink bg-candy-yellow shadow-chunk-sm' : 'border-ink/15 bg-white hover:border-ink'
      }`}
    >{children}</button>
  )
}

function groupByDay(logs) {
  const ordered = [...logs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const groups = []
  const seen = new Map()
  for (const l of ordered) {
    const d = new Date(l.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    let g = seen.get(key)
    if (!g) {
      g = { key, label: dayLabel(d), items: [] }
      seen.set(key, g)
      groups.push(g)
    }
    g.items.push(l)
  }
  return groups
}

/** "Today · 15 Nov 2026" — relative where it helps, always the full date. */
function dayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today - that) / DAY)
  const full = formatDate(d)
  if (diff === 0) return `Today · ${full}`
  if (diff === 1) return `Yesterday · ${full}`
  return `${d.toLocaleDateString([], { weekday: 'long' })} · ${full}`
}

const formatDate = (v) => new Date(v).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
const formatTime = (v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()
