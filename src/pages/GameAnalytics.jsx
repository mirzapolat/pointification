import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import * as api from '../lib/api'
import { subscribeToGame, subscribeToPublicGame } from '../lib/realtime'

const SCOPES = [
  { id: 'week', label: 'Week',  days: 7   },
  { id: 'm1',   label: 'Month', days: 30  },
  { id: 'm3',   label: '3 mo',  days: 90  },
  { id: 'm6',   label: '6 mo',  days: 180 },
  { id: 'y1',   label: '12 mo', days: 365 },
  { id: 'all',  label: 'All',   days: null },
]

const HOUR = 3600 * 1000
const DAY = 24 * HOUR
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_LONG = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']

// Chart tokens. Team lines wear the team's own color; everything else is ink.
// Theme-aware (CSS variables, see styles.css) so charts follow dark mode.
const INK = 'rgb(var(--line))'
const HALO = 'rgb(var(--surface))'
const GRID = 'rgb(var(--ink) / 0.08)'
const AXIS = 'rgb(var(--ink) / 0.55)'
const inkA = a => `rgb(var(--ink) / ${a})`
const GAIN = '#12A27A'   // diverging pole: points won
const LOSS = '#E5486B'   // diverging pole: points lost
const HEAT = '77,124,255' // candy blue, sequential ramp via opacity

/**
 * Owner/member analytics at /game/:id/analytics, or — with `publicView` — the
 * read-only version behind a share link at /p/:token/analytics (names only).
 */
export default function GameAnalytics({ publicView = false }) {
  const { id: gameId, token } = useParams()
  const id = publicView ? null : gameId
  const nav = useNavigate()
  const [game, setGame] = useState(null)
  const [teams, setTeams] = useState([])
  const [logs, setLogs] = useState([])
  const [scope, setScope] = useState('m1')
  const [mode, setMode] = useState('time') // time | events
  const [focus, setFocus] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (publicView) {
      const { data: d } = await api.getPublicAnalytics(token)
      setGame(d?.game ?? null)
      setTeams(d?.teams ?? [])
      setLogs(d?.logs ?? [])
    } else {
      const [{ data: g }, { data: l }] = await Promise.all([api.getGame(id), api.listLogs(id)])
      setGame(g ?? null)
      setTeams(g?.teams ?? [])
      setLogs(l ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id, token, publicView])
  // Inserts and undos both change history, so re-read rather than patch.
  // The public stream only carries scoreboard changes; every score change
  // (and undo) moves a team, so re-read then.
  useEffect(() => {
    if (publicView) {
      if (!token) return
      return subscribeToPublicGame(token, {
        teams: load,
        games: ({ type, row }) => {
          if (type === 'DELETE' || !row?.is_public || !row.public_analytics || row.public_token !== token) setGame(null)
          else setGame(g => (g ? { ...g, ...row } : g))
        },
      })
    }
    return subscribeToGame(id, { point_logs: load, teams: load })
  }, [id, token, publicView])

  const since = useMemo(() => {
    const s = SCOPES.find(x => x.id === scope)
    return s?.days ? startOfDay(Date.now() - (s.days - 1) * DAY) : null
  }, [scope])

  const a = useMemo(() => analyze(teams, logs, since), [teams, logs, since])

  if (loading) {
    return <div className="h-full grid place-items-center bg-cream font-display text-3xl animate-pulse">loading…</div>
  }
  if (!game && publicView) {
    return (
      <div className="h-full grid place-items-center bg-cream px-4">
        <div className="card-chunk p-8 text-center max-w-sm">
          <div className="text-5xl mb-3" aria-hidden="true">🔒</div>
          <h2 className="font-display text-3xl font-bold">Not available</h2>
          <p className="text-ink/60 mt-2">The owner hasn't shared this game's analytics.</p>
          <Link to={`/p/${encodeURIComponent(token)}`} className="btn-chunk bg-candy-mint mt-5">Back to scoreboard</Link>
        </div>
      </div>
    )
  }
  if (!game) {
    return (
      <div className="h-full grid place-items-center bg-cream">
        <div className="card-chunk p-8 text-center">
          <h2 className="font-display text-3xl font-bold">Game not found</h2>
          <Link to="/" className="btn-chunk bg-candy-mint mt-4">← Back</Link>
        </div>
      </div>
    )
  }

  const hasEvents = a.events.length > 0

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full pb-home bg-cream bg-grid">
      {publicView
        ? <PublicHeader token={token} name={game.name} showLog={!!game.public_log} />
        : <Header id={id} name={game.name} onBack={() => nav('/')} />}

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-5 md:py-8 space-y-5 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <ScopeControl scope={scope} setScope={setScope} />
          <div className="text-xs font-semibold text-ink/55 px-1">
            {formatRange(a.start, a.end)} · {a.events.length} {a.events.length === 1 ? 'change' : 'changes'}
          </div>
        </div>

        <Kpis a={a} teams={teams} />

        {teams.length === 0 ? (
          <div className="card-chunk p-10 text-center">
            <div className="text-4xl mb-2" aria-hidden="true">📊</div>
            <h3 className="font-display text-xl font-bold">No teams yet</h3>
            <p className="text-sm text-ink/60 mt-1">Add teams and score some points to see the analytics.</p>
          </div>
        ) : (
          <>
            <Card
              title="The race"
              subtitle={mode === 'time'
                ? 'Every score change, at the exact moment it happened.'
                : 'Every score change, one step each, so busy moments are easy to read.'}
              right={<ModeToggle mode={mode} setMode={setMode} />}
            >
              <Legend teams={teams} focus={focus} setFocus={setFocus} />
              <ScoreRace a={a} teams={teams} mode={mode} focus={focus} />
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
              <Card title="Points won & lost" subtitle="Above the line: points won. Below: points taken away.">
                {hasEvents ? <ActivityChart a={a} teams={teams} /> : <EmptyChart />}
              </Card>
              <Card title="When points happen" subtitle="Changes by weekday and hour of the day.">
                {hasEvents ? <Heatmap a={a} /> : <EmptyChart />}
              </Card>
            </div>

            {hasEvents && (
              <section>
                <SectionTitle>Records</SectionTitle>
                <Records a={a} />
              </section>
            )}

            {hasEvents && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 md:gap-6 items-start">
                <Card className="lg:col-span-2" title="Overtakes" subtitle="Who passed whom, and when.">
                  <Overtakes a={a} />
                </Card>
                <Card className="lg:col-span-3" title="Day by day" subtitle="Net points per team on each active day.">
                  <DayTable a={a} teams={teams} />
                </Card>
              </div>
            )}

            <section>
              <div className="flex items-end justify-between gap-3">
                <SectionTitle>Teams</SectionTitle>
                {(!publicView || game.public_log) && (
                  <Link to={publicView ? `/p/${encodeURIComponent(token)}/log` : `/game/${id}/log`} className="mb-3 text-sm font-semibold underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink">
                    Full log →
                  </Link>
                )}
              </div>
              <TeamCards a={a} teams={teams} />
            </section>
          </>
        )}
      </main>
    </motion.div>
  )
}

/* ================================================================ layout */

function Header({ id, name, onBack }) {
  return (
    <header className="px-safe [--px:1rem] md:[--px:2rem] py-3 md:py-4 flex items-center justify-between gap-3 bg-cream/80 backdrop-blur border-b-2 border-ink sticky top-0 z-20">
      <button onClick={onBack} className="btn-chunk bg-white text-sm h-10 py-0 px-2.5 md:px-3 shrink-0" aria-label="Back to games" title="Back to games">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="md:hidden" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        <span className="hidden md:inline">← Games</span>
      </button>
      <div className="min-w-0 text-center flex-1">
        <div className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-ink/50 leading-none mb-1">Analytics</div>
        <h1 className="font-display font-bold text-base md:text-2xl truncate leading-tight">{name}</h1>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link to={`/game/${id}/log`} className="btn-chunk bg-white text-sm h-10 py-0 px-2.5 md:px-3" aria-label="Open log" title="Open log">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          <span className="hidden md:inline">Log</span>
        </Link>
        <Link to={`/game/${id}`} className="btn-chunk bg-candy-yellow text-sm h-10 py-0 px-2.5 md:px-3" aria-label="Open game" title="Open game">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="md:hidden" aria-hidden="true">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span className="hidden md:inline">Open game →</span>
        </Link>
      </div>
    </header>
  )
}

function PublicHeader({ token, name, showLog }) {
  const base = `/p/${encodeURIComponent(token)}`
  return (
    <header className="px-safe [--px:1rem] md:[--px:2rem] py-3 md:py-4 flex items-center justify-between gap-3 bg-cream/80 backdrop-blur border-b-2 border-ink sticky top-0 z-20">
      <Link to={base} className="btn-chunk bg-white text-sm h-10 py-0 px-2.5 md:px-3 shrink-0" aria-label="Back to scoreboard" title="Back to scoreboard">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="md:hidden" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        <span className="hidden md:inline">← Scoreboard</span>
      </Link>
      <div className="min-w-0 text-center flex-1">
        <div className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-ink/50 leading-none mb-1">Analytics</div>
        <h1 className="font-display font-bold text-base md:text-2xl truncate leading-tight">{name}</h1>
      </div>
      {showLog ? (
        <Link to={`${base}/log`} className="btn-chunk bg-white text-sm h-10 py-0 px-2.5 md:px-3 shrink-0" aria-label="Open log" title="Open log">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          <span className="hidden md:inline">Log</span>
        </Link>
      ) : <div className="w-10 shrink-0" aria-hidden="true" />}
    </header>
  )
}

function Card({ title, subtitle, right, className = '', children }) {
  return (
    <section className={`card-chunk p-4 md:p-6 min-w-0 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
        <div className="min-w-0">
          <h2 className="font-display font-bold text-xl md:text-2xl leading-tight">{title}</h2>
          {subtitle && <p className="text-xs md:text-sm text-ink/55 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function SectionTitle({ children }) {
  return <h2 className="font-display font-bold text-xl md:text-2xl mb-3 px-1">{children}</h2>
}

function EmptyChart() {
  return (
    <div className="h-40 grid place-items-center rounded-2xl border-2 border-dashed border-ink/15 text-sm text-ink/50 text-center px-4">
      No point changes in this range.
    </div>
  )
}

function ScopeControl({ scope, setScope }) {
  return (
    <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
      <div className="flex gap-1 p-1 rounded-2xl border-2 border-ink bg-white w-max">
        {SCOPES.map(s => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            aria-pressed={scope === s.id}
            className={`px-3 py-1.5 rounded-xl font-display font-semibold text-sm whitespace-nowrap transition ${
              scope === s.id ? 'bg-ink text-cream' : 'text-ink/70 hover:text-ink hover:bg-cream'
            }`}
          >{s.label}</button>
        ))}
      </div>
    </div>
  )
}

function ModeToggle({ mode, setMode }) {
  const opts = [{ id: 'time', label: 'Timeline' }, { id: 'events', label: 'Step by step' }]
  return (
    <div className="flex gap-1 p-1 rounded-xl border-2 border-ink/15 bg-cream/60 shrink-0">
      {opts.map(o => (
        <button
          key={o.id}
          onClick={() => setMode(o.id)}
          aria-pressed={mode === o.id}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
            mode === o.id ? 'bg-white shadow-[inset_0_0_0_2px_rgb(var(--line))]' : 'text-ink/60 hover:text-ink'
          }`}
        >{o.label}</button>
      ))}
    </div>
  )
}

function Legend({ teams, focus, setFocus }) {
  const ordered = [...teams].sort((x, y) => y.score - x.score)
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {ordered.map(t => {
        const active = focus === t.id
        const dim = focus && !active
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setFocus(f => (f === t.id ? null : t.id))}
            aria-pressed={active}
            title={active ? 'Show all teams' : `Highlight ${t.name}`}
            className={`inline-flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-xl border-2 text-sm transition ${
              active ? 'border-ink bg-cream shadow-chunk-sm' : 'border-ink/15 bg-white hover:border-ink'
            } ${dim ? 'opacity-45' : ''}`}
          >
            <span className="w-3 h-3 rounded-full border-2 border-ink shrink-0" style={{ background: t.color }} />
            <span className="font-semibold truncate max-w-[9rem]">{t.name}</span>
            <span className="font-display font-bold tabular-nums text-ink/70">{fmt(t.score)}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ================================================================ KPIs */

function Kpis({ a, teams }) {
  const ranked = [...teams].sort((x, y) => y.score - x.score)
  const [first, second] = ranked
  const margin = first && second ? first.score - second.score : null
  const lastChange = a.leadChanges[a.leadChanges.length - 1]
  const items = [
    {
      label: 'Leader',
      value: first ? first.name : '—',
      swatch: first?.color,
      sub: !first ? 'no teams yet'
        : margin === null ? `${fmt(first.score)} pts`
        : margin === 0 ? `tied with ${second.name}`
        : `${fmt(margin)} ahead of ${second.name}`,
      bg: 'bg-candy-yellow',
    },
    {
      label: 'Points won',
      value: `+${fmt(a.totals.gained)}`,
      sub: `${a.totals.gains} ${a.totals.gains === 1 ? 'award' : 'awards'}`,
      bg: 'bg-candy-mint',
    },
    {
      label: 'Points lost',
      value: a.totals.lost ? `−${fmt(a.totals.lost)}` : '0',
      sub: `${a.totals.losses} ${a.totals.losses === 1 ? 'deduction' : 'deductions'}`,
      bg: 'bg-candy-pink',
    },
    {
      label: 'Lead changes',
      value: fmt(a.leadChanges.length),
      sub: lastChange
        ? `last: ${a.teamMap[lastChange.team]?.name ?? 'a team'}, ${formatDay(lastChange.ts)}`
        : `${a.overtakes.length} ${a.overtakes.length === 1 ? 'overtake' : 'overtakes'} in total`,
      bg: 'bg-candy-blue',
    },
  ]
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {items.map((it, i) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
          className={`card-chunk p-3.5 md:p-5 min-w-0 ${it.bg}`}
        >
          <div className="text-[11px] md:text-xs font-bold uppercase tracking-wider text-ink/70">{it.label}</div>
          <div className="font-display font-bold text-xl md:text-3xl mt-1 leading-tight flex items-center gap-2 min-w-0">
            {it.swatch && <span className="w-3 h-3 rounded-full border-2 border-ink shrink-0" style={{ background: it.swatch }} />}
            <span className="truncate">{it.value}</span>
          </div>
          <div className="text-xs mt-1 truncate text-ink/70">{it.sub}</div>
        </motion.div>
      ))}
    </section>
  )
}

/* ================================================================ race chart */

function ScoreRace({ a, teams, mode, focus }) {
  const [ref, w] = useWidth()
  const [hover, setHover] = useState(null)
  const frames = useMemo(() => (mode === 'events' ? a.frames.filter(f => !f.isNow) : a.frames), [a.frames, mode])
  const n = frames.length
  const H = w < 640 ? 250 : 380

  useEffect(() => { setHover(null) }, [frames])

  const geo = useMemo(() => {
    if (!w || !teams.length || !n) return null
    let lo = Infinity, hi = -Infinity
    for (const f of frames) for (const t of teams) {
      const v = f.scores[t.id] ?? 0
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    if (lo > 0 && lo < hi * 0.35) lo = 0
    if (lo === hi) { lo -= 1; hi += 1 }
    const ticks = niceTicks(lo, hi, H < 300 ? 4 : 6)
    const yMin = ticks[0], yMax = ticks[ticks.length - 1]
    const labelW = Math.max(...ticks.map(v => fmt(v).length)) * 7 + 14
    const P = { l: labelW, r: 12, t: 12, b: 28 }
    const iw = Math.max(10, w - P.l - P.r)
    const ih = H - P.t - P.b
    const span = a.end - a.start || 1
    const xs = frames.map((f, k) => mode === 'time'
      ? P.l + ((f.ts - a.start) / span) * iw
      : P.l + (n > 1 ? k / (n - 1) : 0.5) * iw)
    const y = v => P.t + ih * (1 - (v - yMin) / (yMax - yMin))
    const paths = teams.map(t => {
      let d = ''
      frames.forEach((f, k) => {
        const X = xs[k].toFixed(1), Y = y(f.scores[t.id] ?? 0).toFixed(1)
        if (k === 0) d = `M${X} ${Y}`
        else d += mode === 'time' ? `H${X}V${Y}` : `L${X} ${Y}`
      })
      if (n === 1) d += `H${(P.l + iw).toFixed(1)}`
      return { team: t, d }
    })
    const maxTicks = Math.max(3, Math.floor(iw / 70))
    const xt = mode === 'time'
      ? timeTicks(a.start, a.end, maxTicks).map(tk => ({ x: P.l + ((tk.ts - a.start) / span) * iw, label: tk.label }))
      : eventTicks(frames, xs, maxTicks)
    return { P, iw, ih, xs, y, ticks, paths, xt }
  }, [w, H, frames, teams, mode, a.start, a.end, n])

  const pick = (e) => {
    if (!geo) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const xs = geo.xs
    let lo = 0, hi = xs.length - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (xs[m] < px) lo = m; else hi = m
    }
    setHover(Math.abs(xs[lo] - px) <= Math.abs(xs[hi] - px) ? lo : hi)
  }

  const k = hover ?? n - 1
  const frame = frames[k]
  const overtakesHere = a.overtakes.filter(o => o.k === frame?.k)
  // The highlighted team draws last so it sits on top.
  const ordered = geo ? [...geo.paths].sort((p, q) => (p.team.id === focus) - (q.team.id === focus)) : []
  // Lead changes are the moments worth marking; regular overtakes stay in the readout.
  const markers = geo ? a.leadChanges : []

  return (
    <div ref={ref} className="w-full min-w-0">
      {geo && (
        <svg
          width={w}
          height={H}
          className="block select-none"
          style={{ touchAction: 'pan-y' }}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null) }}
          role="img"
          aria-label="Score of every team over time"
        >
          {geo.ticks.map(v => (
            <g key={v}>
              <line x1={geo.P.l} x2={w - geo.P.r} y1={geo.y(v)} y2={geo.y(v)} stroke={v === 0 ? inkA(0.3) : GRID} />
              <text x={geo.P.l - 8} y={geo.y(v) + 4} textAnchor="end" fontSize="11" fill={AXIS}>{fmt(v)}</text>
            </g>
          ))}
          {geo.xt.map((t, i) => (
            <text
              key={i}
              x={t.x}
              y={H - 8}
              textAnchor={t.x < geo.P.l + 24 ? 'start' : t.x > w - geo.P.r - 24 ? 'end' : 'middle'}
              fontSize="11"
              fill={AXIS}
            >{t.label}</text>
          ))}

          {ordered.map(({ team, d }) => {
            const dim = focus && focus !== team.id
            return (
              <g key={team.id} opacity={dim ? 0.18 : 1} style={{ transition: 'opacity .2s' }}>
                <path d={d} fill="none" stroke={HALO} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke={team.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )
          })}

          {markers.map((c, i) => {
            const idx = frames.findIndex(f => f.k === c.k)
            if (idx < 0) return null
            const t = a.teamMap[c.team]
            const cy = geo.y(frames[idx].scores[c.team])
            return (
              <g key={i} opacity={focus && focus !== c.team ? 0.2 : 1} pointerEvents="none">
                <circle cx={geo.xs[idx]} cy={cy} r="6.5" fill={t?.color ?? '#ccc'} stroke={INK} strokeWidth="2" />
                <circle cx={geo.xs[idx]} cy={cy} r="2" fill={INK} />
              </g>
            )
          })}

          {hover != null && frame && (
            <g pointerEvents="none">
              <line x1={geo.xs[k]} x2={geo.xs[k]} y1={geo.P.t} y2={H - geo.P.b} stroke={INK} strokeOpacity="0.35" strokeWidth="1" />
              {teams.map(t => (
                <circle key={t.id} cx={geo.xs[k]} cy={geo.y(frame.scores[t.id] ?? 0)} r="5" fill={t.color} stroke={HALO} strokeWidth="2"
                  opacity={focus && focus !== t.id ? 0.25 : 1} />
              ))}
            </g>
          )}
        </svg>
      )}
      {!geo && <div style={{ height: H }} />}

      {frame && (
        <RaceReadout
          frame={frame}
          prev={frames[k - 1]}
          teams={teams}
          teamMap={a.teamMap}
          overtakes={overtakesHere}
          leadChange={a.leadChanges.find(c => c.k === frame.k)}
          hovering={hover != null}
          focus={focus}
        />
      )}
      {a.leadChanges.length > 0 && (
        <p className="mt-2 text-[11px] text-ink/50 flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill={HALO} stroke={INK} strokeWidth="1.5" /><circle cx="6" cy="6" r="1.5" fill={INK} /></svg>
          Marks a new leader. Hover or tap the chart to step through every change.
        </p>
      )}
    </div>
  )
}

function RaceReadout({ frame, prev, teams, teamMap, overtakes, leadChange, hovering, focus }) {
  const ranked = [...teams].sort((x, y) => (frame.scores[y.id] ?? 0) - (frame.scores[x.id] ?? 0))
  // "Now" carries no change of its own; show the last one that led here.
  const shownLog = frame.log ?? (frame.isNow ? prev?.log : null)
  const when = frame.isStart ? `Start · ${formatDateTime(frame.ts)}`
    : frame.isNow ? (prev?.log ? `Latest · ${formatDateTime(prev.ts)}` : 'Now')
    : formatDateTime(frame.ts)
  const lt = shownLog ? teamMap[shownLog.team_id] : null
  return (
    <div className="mt-3 rounded-2xl border-2 border-ink/10 bg-cream/70 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink/55">
          {!hovering && !frame.isNow ? `Latest · ${when}` : when}
        </span>
        {shownLog && (
          <span className="inline-flex items-center gap-1.5 text-sm min-w-0">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-ink shrink-0" style={{ background: lt?.color }} />
            <span className="font-semibold truncate">{lt?.name ?? 'Deleted team'}</span>
            <span className={`font-display font-bold tabular-nums ${shownLog.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{signed(shownLog.delta)}</span>
            {shownLog.user_name && <span className="text-ink/50 truncate">by {shownLog.user_name}</span>}
          </span>
        )}
        {leadChange && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-candy-yellow border-2 border-ink text-xs font-bold">
            👑 {teamMap[leadChange.team]?.name} takes the lead
          </span>
        )}
        {overtakes.filter(o => !(leadChange && o.forLead && o.winner === leadChange.team)).map((o, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border-2 border-ink/20 text-xs font-semibold">
            ⚡ {teamMap[o.winner]?.name} passes {teamMap[o.loser]?.name}
          </span>
        ))}
      </div>
      <ol className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
        {ranked.map((tm, i) => (
          <li key={tm.id} className={`flex items-center gap-2 text-sm min-w-0 ${focus && focus !== tm.id ? 'opacity-45' : ''}`}>
            <span className="w-5 text-right text-xs font-bold text-ink/45 tabular-nums shrink-0">{i + 1}.</span>
            <span className="w-2.5 h-2.5 rounded-full border-2 border-ink shrink-0" style={{ background: tm.color }} />
            <span className={`truncate ${frame.log?.team_id === tm.id ? 'font-bold' : 'font-medium'}`}>{tm.name}</span>
            <span className="ml-auto font-display font-bold tabular-nums">{fmt(frame.scores[tm.id] ?? 0)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ================================================================ activity */

function ActivityChart({ a }) {
  const [ref, w] = useWidth()
  const [hover, setHover] = useState(null)
  const H = w < 640 ? 210 : 260

  const unit = useMemo(() => {
    const days = Math.ceil((a.end - a.start) / DAY)
    const cap = Math.max(4, Math.floor((w - 60) / 7))
    return days <= cap ? 'day' : days / 7 <= cap ? 'week' : 'month'
  }, [a.start, a.end, w])

  const buckets = useMemo(() => bucketize(a.events, a.start, a.end, unit), [a.events, a.start, a.end, unit])
  useEffect(() => { setHover(null) }, [buckets])

  const geo = useMemo(() => {
    if (!w || !buckets.length) return null
    const up = Math.max(0, ...buckets.map(b => b.gained))
    const down = Math.max(0, ...buckets.map(b => b.lost))
    const ticks = niceTicks(down ? -down : 0, up || 1, 4)
    const yMin = ticks[0], yMax = ticks[ticks.length - 1]
    const labelW = Math.max(...ticks.map(v => fmt(Math.abs(v)).length + 1)) * 7 + 14
    const P = { l: labelW, r: 6, t: 10, b: 26 }
    const iw = w - P.l - P.r, ih = H - P.t - P.b
    const y = v => P.t + ih * (1 - (v - yMin) / (yMax - yMin))
    const slot = iw / buckets.length
    const bw = Math.max(1.5, Math.min(24, slot * 0.62))
    const every = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(iw / 64))))
    return { P, iw, ih, y, slot, bw, ticks, every }
  }, [w, H, buckets])

  const b = hover != null ? buckets[hover] : null
  const teamNets = b ? Object.entries(b.teams).filter(([, v]) => v.net !== 0).sort((x, y) => y[1].net - x[1].net) : []

  return (
    <div ref={ref} className="w-full min-w-0">
      {geo ? (
        <svg width={w} height={H} className="block select-none" style={{ touchAction: 'pan-y' }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null) }}
          role="img" aria-label="Points won and lost per period">
          {geo.ticks.map(v => (
            <g key={v}>
              <line x1={geo.P.l} x2={w - geo.P.r} y1={geo.y(v)} y2={geo.y(v)} stroke={v === 0 ? inkA(0.35) : GRID} />
              <text x={geo.P.l - 8} y={geo.y(v) + 4} textAnchor="end" fontSize="11" fill={AXIS}>{signed(v)}</text>
            </g>
          ))}
          {buckets.map((bk, i) => {
            const cx = geo.P.l + geo.slot * (i + 0.5)
            const x = cx - geo.bw / 2
            const y0 = geo.y(0)
            const active = hover === i
            return (
              <g key={bk.ts} opacity={hover != null && !active ? 0.45 : 1}>
                {bk.gained > 0 && <path d={roundedBar(x, y0 - 1, geo.bw, y0 - 1 - geo.y(bk.gained), 'up')} fill={GAIN} />}
                {bk.lost > 0 && <path d={roundedBar(x, y0 + 1, geo.bw, geo.y(-bk.lost) - y0 - 1, 'down')} fill={LOSS} />}
                {i % geo.every === 0 && (
                  <text x={cx} y={H - 8} textAnchor={cx < geo.P.l + 20 ? 'start' : cx > w - 24 ? 'end' : 'middle'} fontSize="11" fill={AXIS}>
                    {bucketTick(bk.ts, unit)}
                  </text>
                )}
                <rect x={geo.P.l + geo.slot * i} y={0} width={geo.slot} height={H - geo.P.b} fill="transparent"
                  onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              </g>
            )
          })}
        </svg>
      ) : <div style={{ height: H }} />}

      <div className="mt-3 rounded-2xl border-2 border-ink/10 bg-cream/70 p-3 text-sm min-h-[4.5rem]">
        {b ? (
          <>
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink/55">{bucketLabel(b.ts, unit)}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              <span><b className="font-display text-emerald-700 tabular-nums">+{fmt(b.gained)}</b> won</span>
              <span><b className="font-display text-rose-700 tabular-nums">−{fmt(b.lost)}</b> lost</span>
              <span className="text-ink/60">{b.count} {b.count === 1 ? 'change' : 'changes'}</span>
            </div>
            {teamNets.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {teamNets.map(([tid, v]) => (
                  <span key={tid} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white border-2 border-ink/10 text-xs">
                    <span className="w-2 h-2 rounded-full border border-ink" style={{ background: a.teamMap[tid]?.color }} />
                    <span className="font-semibold">{a.teamMap[tid]?.name ?? 'Deleted'}</span>
                    <span className={`font-bold tabular-nums ${v.net > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{signed(v.net)}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-ink/60">
            Grouped by <b className="text-ink">{unit}</b>. Hover or tap a bar to see who won and lost points.
          </div>
        )}
      </div>
    </div>
  )
}

/* ================================================================ heatmap */

function Heatmap({ a }) {
  const [ref, w] = useWidth()
  const [hover, setHover] = useState(null) // [weekday, hour]

  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ count: 0, gained: 0, lost: 0 })))
    for (const e of a.events) {
      const d = new Date(e.ts)
      const c = g[(d.getDay() + 6) % 7][d.getHours()]
      c.count++
      if (e.delta > 0) c.gained += e.delta; else c.lost -= e.delta
    }
    let max = 0, peak = null
    g.forEach((row, di) => row.forEach((c, hi) => { if (c.count > max) { max = c.count; peak = [di, hi] } }))
    const perDay = g.map(row => row.reduce((s, c) => s + c.count, 0))
    const perHour = Array.from({ length: 24 }, (_, h) => g.reduce((s, row) => s + row[h].count, 0))
    return { g, max, peak, perDay, perHour }
  }, [a.events])

  const labelW = 34
  const gap = 2
  const cell = w ? Math.max(8, Math.min(30, Math.floor((w - labelW) / 24))) : 0
  const H = 7 * cell + 20
  const hourStep = cell < 16 ? 6 : 3

  const sel = hover ?? grid.peak
  const c = sel ? grid.g[sel[0]][sel[1]] : null
  const bestDay = grid.perDay.indexOf(Math.max(...grid.perDay))
  const bestHour = grid.perHour.indexOf(Math.max(...grid.perHour))

  return (
    <div ref={ref} className="w-full min-w-0">
      {cell > 0 ? (
        <svg width={labelW + 24 * cell} height={H} className="block select-none max-w-full"
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null) }}
          role="img" aria-label="Point changes by weekday and hour">
          {WEEKDAYS.map((d, di) => (
            <text key={d} x={0} y={di * cell + cell / 2 + 4} fontSize="11" fill={AXIS}>{d}</text>
          ))}
          {grid.g.map((row, di) => row.map((cc, hi) => {
            const t = grid.max ? cc.count / grid.max : 0
            const isSel = sel && sel[0] === di && sel[1] === hi
            return (
              <rect
                key={`${di}-${hi}`}
                x={labelW + hi * cell + gap / 2}
                y={di * cell + gap / 2}
                width={cell - gap}
                height={cell - gap}
                rx={Math.min(4, cell / 4)}
                fill={cc.count ? `rgba(${HEAT},${(0.15 + 0.85 * Math.pow(t, 0.75)).toFixed(3)})` : inkA(0.045)}
                stroke={isSel ? INK : 'none'}
                strokeWidth={isSel ? 2 : 0}
                onPointerEnter={() => setHover([di, hi])}
                onPointerDown={() => setHover([di, hi])}
              />
            )
          }))}
          {Array.from({ length: 24 / hourStep }, (_, i) => i * hourStep).map(h => (
            <text key={h} x={labelW + h * cell} y={7 * cell + 15} fontSize="11" fill={AXIS}>{String(h).padStart(2, '0')}</text>
          ))}
        </svg>
      ) : <div style={{ height: 200 }} />}

      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink/50">
        <span>Fewer</span>
        {[0.15, 0.4, 0.65, 1].map(o => <span key={o} className="w-3.5 h-3.5 rounded" style={{ background: `rgba(${HEAT},${o})` }} />)}
        <span>More changes</span>
      </div>

      <div className="mt-3 rounded-2xl border-2 border-ink/10 bg-cream/70 p-3 text-sm min-h-[4.5rem]">
        {c && (
          <>
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink/55">
              {hover ? '' : 'Peak · '}{WEEKDAYS_LONG[sel[0]]}, {hourRange(sel[1])}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              <span><b className="font-display tabular-nums">{c.count}</b> {c.count === 1 ? 'change' : 'changes'}</span>
              {c.gained > 0 && <span><b className="font-display text-emerald-700 tabular-nums">+{fmt(c.gained)}</b> won</span>}
              {c.lost > 0 && <span><b className="font-display text-rose-700 tabular-nums">−{fmt(c.lost)}</b> lost</span>}
            </div>
          </>
        )}
        <div className="mt-1 text-xs text-ink/60">
          Busiest weekday: <b className="text-ink">{WEEKDAYS_LONG[bestDay]}</b> · busiest hour: <b className="text-ink">{hourRange(bestHour)}</b>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ records */

function Records({ a }) {
  const r = a.records
  const tm = (id) => a.teamMap[id]
  const items = [
    r.bestDay && {
      icon: '🚀', label: 'Best day', value: `+${fmt(r.bestDay.gained)}`,
      sub: `${formatDayLong(r.bestDay.ts)}${r.bestDay.top ? ` · ${tm(r.bestDay.top[0])?.name} ${signed(r.bestDay.top[1])}` : ''}`,
      swatch: r.bestDay.top && tm(r.bestDay.top[0])?.color,
    },
    r.worstDay && {
      icon: '📉', label: 'Toughest day', value: `−${fmt(r.worstDay.lost)}`,
      sub: `${formatDayLong(r.worstDay.ts)}${r.worstDay.bottom ? ` · ${tm(r.worstDay.bottom[0])?.name} ${signed(r.worstDay.bottom[1])}` : ''}`,
      swatch: r.worstDay.bottom && tm(r.worstDay.bottom[0])?.color,
    },
    r.busiestDay && {
      icon: '🔥', label: 'Busiest day', value: `${fmt(r.busiestDay.count)} changes`,
      sub: formatDayLong(r.busiestDay.ts),
    },
    r.biggestGain && {
      icon: '💥', label: 'Biggest single award', value: signed(r.biggestGain.delta),
      sub: `${tm(r.biggestGain.team_id)?.name ?? 'Deleted team'} · ${formatDateTime(r.biggestGain.ts)}`,
      swatch: tm(r.biggestGain.team_id)?.color,
    },
    r.biggestLoss && {
      icon: '🧊', label: 'Biggest single deduction', value: signed(r.biggestLoss.delta),
      sub: `${tm(r.biggestLoss.team_id)?.name ?? 'Deleted team'} · ${formatDateTime(r.biggestLoss.ts)}`,
      swatch: tm(r.biggestLoss.team_id)?.color,
    },
    r.comeback && {
      icon: '🔄', label: 'Biggest comeback', value: `${fmt(r.comeback.deficit)} behind`,
      sub: `${tm(r.comeback.team)?.name} took the lead · ${formatDay(r.comeback.ts)}`,
      swatch: tm(r.comeback.team)?.color,
    },
    r.longestLead && {
      icon: '👑', label: 'Longest in the lead', value: formatDuration(r.longestLead.ms),
      sub: `${tm(r.longestLead.team)?.name} · ${Math.round(r.longestLead.share * 100)}% of the range`,
      swatch: tm(r.longestLead.team)?.color,
    },
    r.dramaDay && {
      icon: '⚡', label: 'Most dramatic day', value: `${r.dramaDay.overtakes} overtakes`,
      sub: formatDayLong(r.dramaDay.ts),
    },
    r.hotStreak && {
      icon: '📈', label: 'Hottest streak', value: `${r.hotStreak.length} in a row`,
      sub: `${tm(r.hotStreak.team)?.name} · ${signed(r.hotStreak.sum)} without losing a point`,
      swatch: tm(r.hotStreak.team)?.color,
    },
    r.keeper && {
      icon: '✍️', label: 'Busiest scorekeeper', value: r.keeper.name,
      sub: `${fmt(r.keeper.count)} changes recorded`,
    },
  ].filter(Boolean)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      {items.map((it, i) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
          className="card-chunk p-4 flex items-start gap-3 min-w-0"
        >
          <div className="w-11 h-11 shrink-0 rounded-2xl border-2 border-ink bg-cream grid place-items-center text-xl" aria-hidden="true">{it.icon}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink/55">{it.label}</div>
            <div className="font-display font-bold text-xl leading-tight truncate mt-0.5">{it.value}</div>
            <div className="text-xs text-ink/65 mt-1 flex items-center gap-1.5 min-w-0">
              {it.swatch && <span className="w-2.5 h-2.5 rounded-full border-2 border-ink shrink-0" style={{ background: it.swatch }} />}
              <span className="truncate">{it.sub}</span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

/* ================================================================ overtakes */

function Overtakes({ a }) {
  const [all, setAll] = useState(false)
  const list = [...a.overtakes].reverse()
  if (!list.length) {
    return <div className="text-sm text-ink/55 py-6 text-center">Nobody has overtaken anyone in this range.</div>
  }
  const shown = all ? list : list.slice(0, 7)
  return (
    <div>
      <ul className="divide-y-2 divide-ink/5 -mx-1">
        {shown.map((o, i) => {
          const w = a.teamMap[o.winner], l = a.teamMap[o.loser]
          return (
            <li key={i} className="flex items-center gap-3 px-1 py-2.5">
              <div className={`w-8 h-8 shrink-0 rounded-xl border-2 border-ink grid place-items-center text-sm ${o.forLead ? 'bg-candy-yellow' : 'bg-white'}`} aria-hidden="true">
                {o.forLead ? '👑' : '⚡'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-ink shrink-0" style={{ background: w?.color }} />
                  <span className="font-semibold truncate">{w?.name}</span>
                  <span className="text-ink/50 shrink-0">passed</span>
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-ink shrink-0" style={{ background: l?.color }} />
                  <span className="font-semibold truncate">{l?.name}</span>
                </div>
                <div className="text-xs text-ink/55 truncate">
                  {formatDateTime(o.ts)}{o.forLead ? ' · new leader' : ` · now #${o.rank}`}
                </div>
              </div>
              <div className="text-right shrink-0 font-display font-bold tabular-nums text-sm">
                {fmt(o.ws)}<span className="text-ink/35 font-sans font-medium"> vs </span>{fmt(o.ls)}
              </div>
            </li>
          )
        })}
      </ul>
      {list.length > 7 && (
        <button onClick={() => setAll(v => !v)} className="mt-2 text-sm font-semibold underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink">
          {all ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </div>
  )
}

/* ================================================================ day table */

function DayTable({ a, teams }) {
  const [all, setAll] = useState(false)
  const days = a.days.filter(d => d.count > 0).reverse()
  const maxAbs = Math.max(1, ...days.flatMap(d => Object.values(d.teams).map(v => Math.abs(v.net))))
  const shown = all ? days : days.slice(0, 10)
  const ordered = [...teams].sort((x, y) => y.score - x.score)

  return (
    <div>
      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white text-left text-[11px] font-bold uppercase tracking-wider text-ink/55 pb-2 pr-3">Day</th>
              {ordered.map(t => (
                <th key={t.id} className="pb-2 px-1 text-[11px] font-bold text-ink/70">
                  <span className="inline-flex items-center gap-1.5 max-w-[7rem]">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-ink shrink-0" style={{ background: t.color }} />
                    <span className="truncate">{t.name}</span>
                  </span>
                </th>
              ))}
              <th className="pb-2 pl-2 text-right text-[11px] font-bold uppercase tracking-wider text-ink/55">Net</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(d => {
              const nets = ordered.map(t => d.teams[t.id]?.net ?? 0)
              const best = Math.max(...nets)
              return (
                <tr key={d.ts}>
                  <td className="sticky left-0 z-10 bg-white py-1 pr-3 whitespace-nowrap font-semibold">
                    {formatDay(d.ts)}
                    <span className="block text-[11px] font-medium text-ink/45">{d.count} {d.count === 1 ? 'change' : 'changes'}</span>
                  </td>
                  {ordered.map((t, i) => {
                    const v = nets[i]
                    const o = 0.1 + 0.4 * (Math.abs(v) / maxAbs)
                    return (
                      <td key={t.id} className="p-0.5">
                        <div
                          className={`h-9 min-w-[3.25rem] rounded-lg grid place-items-center tabular-nums font-display font-bold ${v === 0 ? 'text-ink/25' : ''} ${v > 0 && v === best ? 'ring-2 ring-ink ring-inset' : ''}`}
                          style={{ background: v > 0 ? hexA(GAIN, o) : v < 0 ? hexA(LOSS, o) : inkA(0.03) }}
                          title={`${t.name}: ${signed(v)} on ${formatDayLong(d.ts)}`}
                        >
                          {v === 0 ? '·' : signed(v)}
                        </div>
                      </td>
                    )
                  })}
                  <td className={`pl-2 text-right font-display font-bold tabular-nums ${d.net > 0 ? 'text-emerald-700' : d.net < 0 ? 'text-rose-700' : 'text-ink/40'}`}>
                    {signed(d.net)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-ink/50">Outlined: the day's best team.</span>
        {days.length > 10 && (
          <button onClick={() => setAll(v => !v)} className="text-sm font-semibold underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink">
            {all ? 'Show fewer' : `Show all ${days.length} days`}
          </button>
        )}
      </div>
    </div>
  )
}

/* ================================================================ team cards */

function TeamCards({ a, teams }) {
  const ranked = [...teams].sort((x, y) => y.score - x.score)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      {ranked.map((t, i) => {
        const s = a.teamStats[t.id]
        return (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className="card-chunk p-4 md:p-5 min-w-0 flex flex-col"
          >
            <div className="flex items-center gap-3">
              <div className="on-color w-10 h-10 rounded-xl border-2 border-ink grid place-items-center font-display font-bold shrink-0" style={{ background: t.color }}>
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display font-bold text-lg leading-tight truncate">{t.name}</div>
                <div className="text-xs text-ink/55">{s.count} {s.count === 1 ? 'change' : 'changes'} in range</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display font-bold text-2xl tabular-nums leading-none">{fmt(t.score)}</div>
                <div className={`text-xs font-bold tabular-nums mt-1 ${s.net > 0 ? 'text-emerald-700' : s.net < 0 ? 'text-rose-700' : 'text-ink/40'}`}>
                  {s.net === 0 ? '±0' : signed(s.net)}
                </div>
              </div>
            </div>

            <Sparkline frames={a.frames} teamId={t.id} color={t.color} start={a.start} end={a.end} />

            <dl className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Won" value={`+${fmt(s.gained)}`} tone="gain" />
              <Stat label="Lost" value={s.lost ? `−${fmt(s.lost)}` : '0'} tone={s.lost ? 'loss' : null} />
              <Stat label="Best day" value={s.bestDay ? signed(s.bestDay.net) : '—'} sub={s.bestDay && formatDay(s.bestDay.ts)} tone={s.bestDay && 'gain'} />
              <Stat label="Worst day" value={s.worstDay ? signed(s.worstDay.net) : '—'} sub={s.worstDay && formatDay(s.worstDay.ts)} tone={s.worstDay && 'loss'} />
            </dl>

            <div className="mt-3">
              <div className="flex justify-between text-[11px] font-semibold text-ink/55 mb-1">
                <span>Time in the lead</span>
                <span className="tabular-nums">{Math.round(s.leadShare * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-ink/[0.07] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, s.leadShare * 100))}%`, background: t.color, boxShadow: `inset 0 0 0 1.5px ${INK}` }} />
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="rounded-xl bg-cream/70 px-2.5 py-2 min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-ink/50">{label}</dt>
      <dd className={`font-display font-bold tabular-nums leading-tight ${tone === 'gain' ? 'text-emerald-700' : tone === 'loss' ? 'text-rose-700' : ''}`}>
        {value}
        {sub && <span className="block font-sans text-[11px] font-medium text-ink/50 truncate">{sub}</span>}
      </dd>
    </div>
  )
}

function Sparkline({ frames, teamId, color, start, end }) {
  const W = 300, H = 44
  const vals = frames.map(f => f.scores[teamId] ?? 0)
  let lo = Math.min(...vals), hi = Math.max(...vals)
  if (lo === hi) { lo -= 1; hi += 1 }
  const span = end - start || 1
  const x = ts => 2 + ((ts - start) / span) * (W - 4)
  const y = v => H - 4 - ((v - lo) / (hi - lo)) * (H - 8)
  let d = ''
  frames.forEach((f, k) => {
    d += k === 0 ? `M${x(f.ts).toFixed(1)} ${y(vals[k]).toFixed(1)}` : `H${x(f.ts).toFixed(1)}V${y(vals[k]).toFixed(1)}`
  })
  const area = `${d}V${H}H${x(frames[0].ts).toFixed(1)}Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-11 my-3" aria-hidden="true">
      <path d={area} fill={color} opacity="0.18" />
      <path d={d} fill="none" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* ================================================================ analysis */

/**
 * Turns the raw point log into everything the page shows: the score of every
 * team after each change (frames), overtakes, lead changes, per-day buckets,
 * records and per-team stats, all limited to [since, now].
 */
function analyze(teams, logs, since) {
  const now = Date.now()
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const order = Object.fromEntries(teams.map((t, i) => [t.id, i]))
  const sorted = logs
    .filter(l => teamMap[l.team_id])
    .map(l => ({ ...l, ts: new Date(l.created_at).getTime() }))
    .sort((x, y) => x.ts - y.ts || String(x.id).localeCompare(String(y.id)))

  const start = since ?? (sorted.length ? startOfDay(sorted[0].ts) : startOfDay(now - 6 * DAY))
  const end = now

  // Score of every team at the start of the range.
  const lastBefore = {}, firstIn = {}
  for (const l of sorted) {
    if (l.ts < start) lastBefore[l.team_id] = l
    else if (!firstIn[l.team_id]) firstIn[l.team_id] = l
  }
  const init = {}
  for (const t of teams) {
    const b = lastBefore[t.id], f = firstIn[t.id]
    init[t.id] = b ? b.new_score : f ? f.new_score - f.delta : t.score
  }

  const events = sorted.filter(l => l.ts >= start)
  const strictLeader = (s) => {
    let best = null, bestV = -Infinity, tie = false
    for (const t of teams) {
      const v = s[t.id]
      if (v > bestV) { best = t.id; bestV = v; tie = false } else if (v === bestV) tie = true
    }
    return tie ? null : best
  }
  const rankOf = (s, id) => 1 + teams.filter(t => s[t.id] > s[id]).length

  const frames = [{ k: 0, ts: start, scores: { ...init }, log: null, isStart: true }]
  // Last strict order of every pair; a flip is an overtake (ties in between don't count twice).
  const rel = {}
  for (const x of teams) for (const y of teams) {
    if (order[x.id] < order[y.id]) {
      const d = init[x.id] - init[y.id]
      if (d) rel[`${x.id}|${y.id}`] = Math.sign(d)
    }
  }
  const overtakes = []
  const leadChanges = []
  const leadTime = {}
  let leader = strictLeader(init)
  let lastStrict = leader
  let lastTs = start
  const maxDef = {}
  const comebacks = []
  const trackDeficit = (s, lead) => {
    const top = Math.max(...teams.map(t => s[t.id]))
    for (const t of teams) if (t.id !== lead) maxDef[t.id] = Math.max(maxDef[t.id] ?? 0, top - s[t.id])
  }
  if (teams.length) trackDeficit(init, leader)

  let cur = { ...init }
  events.forEach((e, i) => {
    if (leader) leadTime[leader] = (leadTime[leader] ?? 0) + (e.ts - lastTs)
    lastTs = e.ts
    cur = { ...cur, [e.team_id]: e.new_score }
    const k = i + 1
    const newLeader = strictLeader(cur)
    for (const o of teams) {
      if (o.id === e.team_id) continue
      const [x, y] = order[e.team_id] < order[o.id] ? [e.team_id, o.id] : [o.id, e.team_id]
      const key = `${x}|${y}`
      const s = Math.sign(cur[x] - cur[y])
      if (s === 0) continue
      if (rel[key] && rel[key] !== s) {
        const winner = s > 0 ? x : y
        const loser = winner === x ? y : x
        overtakes.push({
          k, ts: e.ts, winner, loser, ws: cur[winner], ls: cur[loser],
          rank: rankOf(cur, winner), forLead: winner === newLeader,
        })
      }
      rel[key] = s
    }
    if (newLeader && newLeader !== lastStrict) {
      if (lastStrict) {
        leadChanges.push({ k, ts: e.ts, team: newLeader, from: lastStrict })
        if (maxDef[newLeader] > 0) comebacks.push({ team: newLeader, deficit: maxDef[newLeader], ts: e.ts })
      }
      maxDef[newLeader] = 0
      lastStrict = newLeader
    }
    leader = newLeader
    trackDeficit(cur, leader)
    frames.push({ k, ts: e.ts, scores: cur, log: e })
  })
  if (leader) leadTime[leader] = (leadTime[leader] ?? 0) + (end - lastTs)
  frames.push({ k: frames.length, ts: end, scores: cur, log: null, isNow: true })

  // Days, for records, the table and team bests.
  const days = bucketize(events, start, end, 'day')
  const dayIdx = new Map(days.map((d, i) => [d.ts, i]))
  for (const o of overtakes) {
    const d = days[dayIdx.get(startOfDay(o.ts))]
    if (d) d.overtakes++
  }

  const totals = { gained: 0, lost: 0, gains: 0, losses: 0 }
  const keepers = {}
  let biggestGain = null, biggestLoss = null
  for (const e of events) {
    if (e.delta > 0) { totals.gained += e.delta; totals.gains++ } else { totals.lost -= e.delta; totals.losses++ }
    if (e.delta > 0 && (!biggestGain || e.delta > biggestGain.delta)) biggestGain = e
    if (e.delta < 0 && (!biggestLoss || e.delta < biggestLoss.delta)) biggestLoss = e
    const who = e.user_name?.trim()
    if (who) keepers[who] = (keepers[who] ?? 0) + 1
  }

  const maxBy = (arr, f) => arr.reduce((b, x) => (f(x) > 0 && (!b || f(x) > f(b)) ? x : b), null)
  const withTop = (d) => {
    if (!d) return null
    const entries = Object.entries(d.teams)
    const top = entries.filter(([, v]) => v.net > 0).sort((x, y) => y[1].net - x[1].net)[0]
    const bottom = entries.filter(([, v]) => v.net < 0).sort((x, y) => x[1].net - y[1].net)[0]
    return { ...d, top: top && [top[0], top[1].net], bottom: bottom && [bottom[0], bottom[1].net] }
  }

  // Longest run of consecutive awards for one team, with no deduction in between.
  let hotStreak = null
  const runs = {}
  for (const e of events) {
    const r = runs[e.team_id] ?? { length: 0, sum: 0 }
    if (e.delta > 0) { r.length++; r.sum += e.delta } else { r.length = 0; r.sum = 0 }
    runs[e.team_id] = r
    if (r.length >= 3 && (!hotStreak || r.length > hotStreak.length || (r.length === hotStreak.length && r.sum > hotStreak.sum))) {
      hotStreak = { team: e.team_id, length: r.length, sum: r.sum }
    }
  }

  const leadEntries = Object.entries(leadTime).sort((x, y) => y[1] - x[1])
  const range = end - start || 1
  const keeperTop = Object.entries(keepers).sort((x, y) => y[1] - x[1])[0]

  const records = {
    bestDay: withTop(maxBy(days, d => d.gained)),
    worstDay: withTop(maxBy(days, d => d.lost)),
    busiestDay: maxBy(days, d => d.count),
    dramaDay: maxBy(days, d => (d.overtakes >= 2 ? d.overtakes : 0)),
    biggestGain,
    biggestLoss,
    comeback: comebacks.sort((x, y) => y.deficit - x.deficit)[0] ?? null,
    longestLead: leadEntries.length && events.length ? { team: leadEntries[0][0], ms: leadEntries[0][1], share: leadEntries[0][1] / range } : null,
    hotStreak,
    keeper: keeperTop ? { name: keeperTop[0], count: keeperTop[1] } : null,
  }

  const teamStats = {}
  for (const t of teams) {
    const s = { gained: 0, lost: 0, net: 0, count: 0, bestDay: null, worstDay: null, leadShare: (leadTime[t.id] ?? 0) / range }
    for (const d of days) {
      const v = d.teams[t.id]
      if (!v) continue
      s.gained += v.gained; s.lost += v.lost; s.net += v.net; s.count += v.count
      if (v.net > 0 && (!s.bestDay || v.net > s.bestDay.net)) s.bestDay = { ts: d.ts, net: v.net }
      if (v.net < 0 && (!s.worstDay || v.net < s.worstDay.net)) s.worstDay = { ts: d.ts, net: v.net }
    }
    teamStats[t.id] = s
  }

  return { start, end, events, frames, overtakes, leadChanges, days, totals, records, teamStats, teamMap }
}

function bucketStart(ts, unit) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (unit === 'month') d.setDate(1)
  return d.getTime()
}

function nextBucket(ts, unit) {
  const d = new Date(ts)
  if (unit === 'day') d.setDate(d.getDate() + 1)
  else if (unit === 'week') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  return d.getTime()
}

function bucketize(events, start, end, unit) {
  const out = []
  const idx = new Map()
  for (let t = bucketStart(start, unit); t <= end && out.length < 6000; t = nextBucket(t, unit)) {
    idx.set(t, out.length)
    out.push({ ts: t, gained: 0, lost: 0, net: 0, count: 0, overtakes: 0, teams: {} })
  }
  for (const e of events) {
    const b = out[idx.get(bucketStart(e.ts, unit))]
    if (!b) continue
    const tt = b.teams[e.team_id] ?? (b.teams[e.team_id] = { gained: 0, lost: 0, net: 0, count: 0 })
    if (e.delta > 0) { b.gained += e.delta; tt.gained += e.delta } else { b.lost -= e.delta; tt.lost -= e.delta }
    b.net += e.delta; tt.net += e.delta
    b.count++; tt.count++
  }
  return out
}

/* ================================================================ helpers */

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.floor(el.clientWidth))
    const ro = new ResizeObserver(([entry]) => setW(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function roundedBar(x, y0, w, h, dir) {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  if (dir === 'up') {
    const top = y0 - h
    return `M${x} ${y0}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + w - r}Q${x + w} ${top} ${x + w} ${top + r}V${y0}Z`
  }
  const bot = y0 + h
  return `M${x} ${y0}V${bot - r}Q${x} ${bot} ${x + r} ${bot}H${x + w - r}Q${x + w} ${bot} ${x + w} ${bot - r}V${y0}Z`
}

function niceTicks(min, max, count) {
  const range = max - min || 1
  const raw = range / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const err = raw / mag
  const step = Math.max(1, (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v))
  return out.length > 1 ? out : [lo, lo + step]
}

function timeTicks(start, end, max) {
  const span = end - start
  const steps = [[HOUR, 'h', 1], [3 * HOUR, 'h', 3], [6 * HOUR, 'h', 6], [12 * HOUR, 'h', 12], [DAY, 'd', 1], [2 * DAY, 'd', 2],
    [7 * DAY, 'd', 7], [14 * DAY, 'd', 14], [30 * DAY, 'm', 1], [91 * DAY, 'm', 3], [182 * DAY, 'm', 6], [365 * DAY, 'm', 12]]
  const [, unit, n] = steps.find(s => span / s[0] <= max) ?? steps[steps.length - 1]
  const d = new Date(start)
  if (unit === 'h') {
    d.setMinutes(0, 0, 0)
    while (d.getTime() < start || d.getHours() % n) d.setHours(d.getHours() + 1)
  } else if (unit === 'd') {
    d.setHours(0, 0, 0, 0)
    if (d.getTime() < start) d.setDate(d.getDate() + 1)
    if (n === 7 || n === 14) while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  } else {
    d.setHours(0, 0, 0, 0); d.setDate(1)
    if (d.getTime() < start) d.setMonth(d.getMonth() + 1)
    while (d.getMonth() % n) d.setMonth(d.getMonth() + 1)
  }
  const out = []
  for (let guard = 0; d.getTime() <= end && guard < 60; guard++) {
    let label
    if (unit === 'h') label = d.getHours() === 0 ? d.toLocaleDateString([], { day: 'numeric', month: 'short' }) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    else if (unit === 'd') label = d.toLocaleDateString([], { day: 'numeric', month: 'short' })
    else label = d.toLocaleDateString([], d.getMonth() === 0 || n >= 6 ? { month: 'short', year: '2-digit' } : { month: 'short' })
    out.push({ ts: d.getTime(), label })
    if (unit === 'h') d.setHours(d.getHours() + n)
    else if (unit === 'd') d.setDate(d.getDate() + n)
    else d.setMonth(d.getMonth() + n)
  }
  return out
}

function eventTicks(frames, xs, max) {
  const n = frames.length
  if (n < 2) return []
  const sameDay = new Date(frames[0].ts).toDateString() === new Date(frames[n - 1].ts).toDateString()
  const count = Math.min(max, n)
  const out = []
  let last = null
  for (let j = 0; j < count; j++) {
    const i = Math.round((j * (n - 1)) / Math.max(1, count - 1))
    const d = new Date(frames[i].ts)
    const label = sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' })
    if (label === last) continue
    last = label
    out.push({ x: xs[i], label })
  }
  return out
}

function bucketTick(ts, unit) {
  const d = new Date(ts)
  if (unit === 'month') return d.toLocaleDateString([], d.getMonth() === 0 ? { month: 'short', year: '2-digit' } : { month: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function bucketLabel(ts, unit) {
  const d = new Date(ts)
  if (unit === 'day') return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  if (unit === 'week') return `Week of ${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`
  return d.toLocaleDateString([], { month: 'long', year: 'numeric' })
}

const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime() }
const fmt = (v) => Number(v).toLocaleString()
const signed = (v) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : '0')
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`
}
const hourRange = (h) => `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`
const formatDay = (ts) => new Date(ts).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
const formatDayLong = (ts) => new Date(ts).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
const formatDateTime = (ts) => new Date(ts).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const formatRange = (a, b) => {
  const o = { day: 'numeric', month: 'short', year: 'numeric' }
  return `${new Date(a).toLocaleDateString([], o)} – ${new Date(b).toLocaleDateString([], o)}`
}
function formatDuration(ms) {
  const h = ms / HOUR
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} min`
  if (h < 48) return `${Math.round(h)} h`
  return `${Math.round(h / 24)} days`
}
