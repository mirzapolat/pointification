import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const PRESETS = [+5, +10, +15, -5, -10, -15]

export default function PointPopup({ team, onApply, onClose, busy }) {
  const [custom, setCustom] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = (n) => {
    if (!Number.isFinite(n) || n === 0) return
    onApply(n)
    onClose()
  }

  const submitCustom = (e) => {
    e.preventDefault()
    const n = parseInt(custom, 10)
    if (Number.isFinite(n)) {
      apply(n)
      setCustom('')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ y: 20, scale: 0.9, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 20, scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20 }}
        className="card-chunk w-full max-w-md overflow-hidden"
      >
        <div className="px-6 py-5 border-b-2 border-ink flex items-center justify-between" style={{ background: team.color }}>
          <div>
            <p className="text-ink/60 text-xs font-semibold uppercase tracking-wider">Adjust points</p>
            <h3 className="font-display text-3xl font-bold leading-none mt-1">{team.name}</h3>
          </div>
          <div className="font-display text-4xl font-bold">{team.score}</div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-3 gap-2 mb-4">
            {PRESETS.map(n => (
              <motion.button
                key={n}
                whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}
                disabled={busy}
                onClick={() => apply(n)}
                className={`btn-chunk py-4 text-2xl font-bold ${n > 0 ? 'bg-candy-mint' : 'bg-candy-pink text-white'}`}
              >
                {n > 0 ? `+${n}` : n}
              </motion.button>
            ))}
          </div>

          <form onSubmit={submitCustom} className="flex gap-2">
            <input
              ref={inputRef}
              type="number"
              inputMode="numeric"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="custom amount (e.g. 7 or -3)"
              className="input-chunk flex-1"
            />
            <button disabled={busy || !custom} className="btn-chunk bg-candy-yellow text-lg disabled:opacity-50">
              Apply
            </button>
          </form>

          <button onClick={onClose} className="w-full mt-3 py-2 font-display font-semibold text-ink/60 hover:text-ink transition">
            close
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
