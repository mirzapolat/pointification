import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { TEAM_PALETTE } from '../lib/colors.js'

const STEPS = ['intro', 'game', 'teams', 'points', 'share', 'done']

export default function Onboarding() {
  const { user, refreshDetails } = useAuth()
  const nav = useNavigate()
  const [stepIdx, setStepIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  // Game state
  const [gameName, setGameName] = useState('Friday Game Night')
  const [gameId, setGameId] = useState(null)

  // Team state
  const [teamDrafts, setTeamDrafts] = useState([
    { name: 'Pink Pandas',  color: TEAM_PALETTE[0] },
    { name: 'Mint Tigers',  color: TEAM_PALETTE[2] },
  ])
  const [teams, setTeams] = useState([])

  // Sharing
  const [publicUrl, setPublicUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const step = STEPS[stepIdx]
  const goNext = () => setStepIdx(i => Math.min(i + 1, STEPS.length - 1))
  const goBack = () => setStepIdx(i => Math.max(i - 1, 0))

  // Create game when leaving 'game' step.
  const createGame = async () => {
    setErr(null)
    if (!gameName.trim()) return setErr('Give your game a name.')
    setBusy(true)
    const { data, error } = await supabase.rpc('create_game', { p_name: gameName.trim() })
    setBusy(false)
    if (error) return setErr(error.message)
    setGameId(data.id)
    goNext()
  }

  const addDraft = () => {
    setTeamDrafts(d => {
      const usedColors = d.map(t => t.color)
      const next = TEAM_PALETTE.find(c => !usedColors.includes(c)) ?? TEAM_PALETTE[d.length % TEAM_PALETTE.length]
      return [...d, { name: `Team ${d.length + 1}`, color: next }]
    })
  }
  const updateDraft = (i, patch) => setTeamDrafts(d => d.map((t, k) => k === i ? { ...t, ...patch } : t))
  const removeDraft = (i) => setTeamDrafts(d => d.filter((_, k) => k !== i))

  const createTeams = async () => {
    setErr(null)
    const cleaned = teamDrafts.map(t => ({ ...t, name: t.name.trim() })).filter(t => t.name)
    if (cleaned.length < 2) return setErr('Add at least two teams to compete.')
    setBusy(true)
    const rows = cleaned.map((t, i) => ({
      game_id: gameId, name: t.name, color: t.color, position: i
    }))
    const { data, error } = await supabase.from('teams').insert(rows).select('id, name, color, score')
    setBusy(false)
    if (error) return setErr(error.message)
    setTeams(data ?? [])
    goNext()
  }

  const tap = async (teamId, delta) => {
    setTeams(ts => ts.map(t => t.id === teamId ? { ...t, score: (t.score ?? 0) + delta } : t))
    const { error } = await supabase.rpc('apply_point_change', { p_team_id: teamId, p_delta: delta })
    if (error) setErr(error.message)
  }
  const totalTaps = useMemo(() => teams.reduce((s, t) => s + Math.abs(t.score ?? 0), 0), [teams])

  const enableShare = async () => {
    setErr(null); setBusy(true)
    const { data, error } = await supabase.rpc('set_game_sharing', { p_game_id: gameId, p_enabled: true })
    setBusy(false)
    if (error) return setErr(error.message)
    setPublicUrl(`${window.location.origin}/p/${data.public_token}`)
    goNext()
  }

  const copyShare = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setErr('Could not copy. Select the link and copy manually.')
    }
  }

  const finish = async () => {
    if (!user) return
    setBusy(true); setErr(null)
    const { error } = await supabase
      .from('user_details')
      .upsert({ id: user.id, onboarding_completed_at: new Date().toISOString() })
    setBusy(false)
    if (error) return setErr(error.message)
    await refreshDetails()
    nav('/', { replace: true })
  }

  const skipAll = async () => {
    if (!user) return
    setBusy(true); setErr(null)
    const { error } = await supabase
      .from('user_details')
      .upsert({ id: user.id, onboarding_completed_at: new Date().toISOString() })
    setBusy(false)
    if (error) return setErr(error.message)
    await refreshDetails()
    nav('/', { replace: true })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full bg-cream bg-grid relative overflow-hidden flex flex-col items-center px-4 py-8"
    >
      <Blobs />

      <div className="relative z-10 w-full max-w-xl">
        <Progress idx={stepIdx} count={STEPS.length - 1} />

        <div className="card-chunk p-6 md:p-8 mt-4 overflow-hidden">
          <AnimatePresence mode="wait">
            {step === 'intro' && (
              <Step key="intro">
                <Header emoji="🎉" title="You're in!" subtitle="Let's set up your first game in 60 seconds." />
                <p className="text-ink/70 leading-relaxed">
                  We'll create a game, add a couple of teams, hand out some points, and grab a
                  shareable link. You can change everything later — promise.
                </p>
                <Actions>
                  <button onClick={skipAll} disabled={busy} className="btn-chunk bg-white">Skip</button>
                  <button onClick={goNext} className="btn-chunk bg-candy-pink text-white flex-1 text-lg">
                    Let's go →
                  </button>
                </Actions>
              </Step>
            )}

            {step === 'game' && (
              <Step key="game">
                <Header emoji="🎲" title="Name your game" subtitle="What are you keeping score of?" />
                <label className="block text-sm font-semibold mb-1">Game name</label>
                <input
                  className="input-chunk"
                  value={gameName}
                  onChange={e => setGameName(e.target.value)}
                  autoFocus
                  placeholder="Friday Quiz Night"
                  onKeyDown={e => { if (e.key === 'Enter') createGame() }}
                />
                <Actions>
                  <button onClick={skipAll} disabled={busy} className="btn-chunk bg-white">Skip</button>
                  <button onClick={createGame} disabled={busy} className="btn-chunk bg-candy-pink text-white flex-1 text-lg disabled:opacity-60">
                    {busy ? 'creating…' : 'Next →'}
                  </button>
                </Actions>
              </Step>
            )}

            {step === 'teams' && (
              <Step key="teams">
                <Header emoji="👥" title="Add some teams" subtitle="Two or more. Pick fun names — you can rename later." />
                <div className="space-y-2">
                  {teamDrafts.map((t, i) => (
                    <motion.div
                      key={i}
                      layout
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                      className="flex items-center gap-2 p-2 rounded-2xl border-2 border-ink bg-cream"
                    >
                      <ColorDot
                        value={t.color}
                        onPick={c => updateDraft(i, { color: c })}
                      />
                      <input
                        className="flex-1 px-3 py-2 rounded-xl border-2 border-ink bg-white outline-none font-medium"
                        value={t.name}
                        onChange={e => updateDraft(i, { name: e.target.value })}
                        placeholder={`Team ${i + 1}`}
                      />
                      <button
                        onClick={() => removeDraft(i)}
                        disabled={teamDrafts.length <= 1}
                        className="w-10 h-10 rounded-xl border-2 border-ink bg-white hover:bg-candy-pink hover:text-white font-bold transition disabled:opacity-40"
                        title="Remove"
                      >×</button>
                    </motion.div>
                  ))}
                  <button
                    onClick={addDraft}
                    className="w-full flex items-center justify-center gap-2 p-2 rounded-2xl border-2 border-dashed border-ink/30 bg-cream/40 text-ink/60 hover:bg-candy-yellow hover:border-ink hover:text-ink font-display font-semibold transition"
                  >
                    <span className="text-lg leading-none">+</span> Add team
                  </button>
                </div>
                <Actions>
                  <button onClick={goBack} disabled={busy} className="btn-chunk bg-white">Back</button>
                  <button onClick={createTeams} disabled={busy} className="btn-chunk bg-candy-pink text-white flex-1 text-lg disabled:opacity-60">
                    {busy ? 'saving…' : 'Next →'}
                  </button>
                </Actions>
              </Step>
            )}

            {step === 'points' && (
              <Step key="points">
                <Header emoji="✨" title="Tap to give points" subtitle="Try it — each tap is logged automatically." />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {teams.map(t => (
                    <motion.div
                      key={t.id}
                      layout
                      whileHover={{ y: -2 }}
                      className="card-chunk overflow-hidden"
                    >
                      <div
                        className="h-16 border-b-2 border-ink relative"
                        style={{ background: t.color }}
                      >
                        <div className="absolute inset-0 bg-dots opacity-30" />
                        <div className="absolute top-2 left-3 font-display font-bold truncate pr-2">{t.name}</div>
                      </div>
                      <div className="p-3 flex items-center gap-2">
                        <button
                          onClick={() => tap(t.id, -1)}
                          className="w-10 h-10 rounded-xl border-2 border-ink bg-white font-display text-xl font-bold hover:bg-candy-pink hover:text-white transition"
                        >−</button>
                        <motion.div
                          key={t.score}
                          initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                          className="flex-1 text-center font-display text-3xl font-bold"
                        >
                          {t.score ?? 0}
                        </motion.div>
                        <button
                          onClick={() => tap(t.id, 1)}
                          className="w-10 h-10 rounded-xl border-2 border-ink bg-white font-display text-xl font-bold hover:bg-candy-mint transition"
                        >+</button>
                      </div>
                    </motion.div>
                  ))}
                </div>
                <motion.p
                  animate={{ opacity: totalTaps > 0 ? 1 : 0.5 }}
                  className="text-sm text-ink/60 mt-3 text-center"
                >
                  {totalTaps === 0
                    ? 'Give at least one point to keep going.'
                    : totalTaps < 3
                      ? 'Nice. Try a few more!'
                      : "Looks great — you've got the hang of it!"}
                </motion.p>
                <Actions>
                  <button onClick={goBack} className="btn-chunk bg-white">Back</button>
                  <button
                    onClick={goNext}
                    disabled={totalTaps === 0}
                    className="btn-chunk bg-candy-pink text-white flex-1 text-lg disabled:opacity-50"
                  >
                    Next →
                  </button>
                </Actions>
              </Step>
            )}

            {step === 'share' && (
              <Step key="share">
                <Header emoji="🔗" title="Share with friends" subtitle="Want a public scoreboard link? They can watch live — no account needed." />
                {!publicUrl ? (
                  <>
                    <div className="rounded-2xl border-2 border-dashed border-ink/30 p-4 bg-cream/50 text-sm text-ink/70">
                      We'll create a read-only link you can text, paste in a chat, or project on a screen.
                      You can turn it off any time.
                    </div>
                    <Actions>
                      <button onClick={goNext} disabled={busy} className="btn-chunk bg-white">Maybe later</button>
                      <button onClick={enableShare} disabled={busy} className="btn-chunk bg-candy-pink text-white flex-1 text-lg disabled:opacity-60">
                        {busy ? 'creating link…' : 'Create my link →'}
                      </button>
                    </Actions>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        readOnly
                        value={publicUrl}
                        onFocus={e => e.target.select()}
                        className="input-chunk flex-1 font-mono text-sm bg-candy-yellow/40"
                      />
                      <button onClick={copyShare} className="btn-chunk bg-white">
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs text-ink/60 mt-3">
                      Tip: open this in another tab to see the live scoreboard.
                    </p>
                    <Actions>
                      <button onClick={goNext} className="btn-chunk bg-candy-pink text-white flex-1 text-lg">
                        Done →
                      </button>
                    </Actions>
                  </>
                )}
              </Step>
            )}

            {step === 'done' && (
              <Step key="done">
                <Header emoji="🎊" title="You're all set!" subtitle="Your first game is live and ready." />
                <p className="text-ink/70 leading-relaxed">
                  Jump in any time to add points, edit teams, or invite collaborators. Have fun!
                </p>
                <Actions>
                  <button onClick={finish} disabled={busy} className="btn-chunk bg-candy-mint flex-1 text-lg disabled:opacity-60">
                    {busy ? 'taking you home…' : 'Take me to my games →'}
                  </button>
                </Actions>
              </Step>
            )}
          </AnimatePresence>

          {err && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="text-sm px-3 py-2 rounded-xl border-2 border-ink bg-candy-pink/30 mt-4"
            >{err}</motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function Step({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
    >
      {children}
    </motion.div>
  )
}

function Header({ emoji, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <motion.div
        animate={{ rotate: [0, -8, 8, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2 }}
        className="w-12 h-12 rounded-2xl border-2 border-ink bg-candy-yellow grid place-items-center text-2xl shrink-0"
      >
        {emoji}
      </motion.div>
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink/60 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function Actions({ children }) {
  return <div className="flex gap-2 mt-6">{children}</div>
}

function ColorDot({ value, onPick }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-10 h-10 rounded-xl border-2 border-ink"
        style={{ background: value }}
        title="Change color"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="absolute left-0 top-12 z-50 p-3 rounded-2xl border-2 border-ink bg-white shadow-chunk grid grid-cols-5 gap-2 w-[15.5rem]"
          >
            {TEAM_PALETTE.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onPick(c); setOpen(false) }}
                className={`w-10 h-10 rounded-lg border-2 border-ink transition-transform hover:-translate-y-0.5 ${value === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-white' : ''}`}
                style={{ background: c }}
                aria-label={`Pick ${c}`}
              />
            ))}
          </motion.div>
        </>
      )}
    </div>
  )
}

function Progress({ idx, count }) {
  // Don't count the final 'done' step as a numbered step.
  const pct = Math.min(100, Math.round((idx / count) * 100))
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 rounded-full border-2 border-ink bg-white overflow-hidden">
        <motion.div
          className="h-full bg-candy-pink"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 140, damping: 22 }}
        />
      </div>
      <div className="font-display font-bold text-sm text-ink/70 w-12 text-right">{pct}%</div>
    </div>
  )
}

function Blobs() {
  const blobs = [
    { c: '#FFD93D', x: '-4%', y: '6%',  s: 200 },
    { c: '#5EE2C1', x: '85%', y: '8%',  s: 180 },
    { c: '#FF4FA3', x: '-2%', y: '70%', s: 220 },
    { c: '#9B6DFF', x: '82%', y: '64%', s: 200 }
  ]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2 border-ink opacity-50"
          style={{ left: b.x, top: b.y, width: b.s, height: b.s, background: b.c }}
          animate={{ y: [0, -14, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 7 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
        />
      ))}
    </div>
  )
}

