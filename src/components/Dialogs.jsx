import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const DialogCtx = createContext(null)

export function useDialogs() {
  const ctx = useContext(DialogCtx)
  if (!ctx) throw new Error('useDialogs must be used inside <DialogProvider>')
  return ctx
}

export function DialogProvider({ children }) {
  const [stack, setStack] = useState([]) // [{ id, kind, opts, resolve }]

  const push = useCallback((kind, opts) => new Promise(resolve => {
    setStack(s => [...s, { id: Math.random().toString(36).slice(2), kind, opts, resolve }])
  }), [])

  const close = useCallback((id, value) => {
    setStack(s => {
      const item = s.find(d => d.id === id)
      if (item) item.resolve(value)
      return s.filter(d => d.id !== id)
    })
  }, [])

  const api = {
    confirm: (opts) => push('confirm', typeof opts === 'string' ? { message: opts } : opts),
    alert:   (opts) => push('alert',   typeof opts === 'string' ? { message: opts } : opts),
  }

  return (
    <DialogCtx.Provider value={api}>
      {children}
      <AnimatePresence>
        {stack.map(d => (
          <DialogShell key={d.id} dialog={d} onClose={close} />
        ))}
      </AnimatePresence>
    </DialogCtx.Provider>
  )
}

function DialogShell({ dialog, onClose }) {
  const { id, kind, opts } = dialog
  const {
    title,
    message,
    confirmLabel = kind === 'confirm' ? 'Confirm' : 'OK',
    cancelLabel  = 'Cancel',
    tone = kind === 'confirm' ? 'danger' : 'neutral', // danger | neutral
  } = opts

  const isConfirm = kind === 'confirm'
  const accept = () => onClose(id, true)
  const dismiss = () => onClose(id, false)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(id, false)
      else if (e.key === 'Enter') onClose(id, true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, onClose])

  const accentBtn = tone === 'danger'
    ? 'bg-candy-pink text-white'
    : 'bg-candy-mint'

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={dismiss}
      className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ y: 20, scale: 0.95, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 20, scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className="card-chunk w-full max-w-sm overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          {title && <h3 className="font-display text-2xl font-bold mb-2">{title}</h3>}
          {message && <p className="text-ink/80 whitespace-pre-wrap">{message}</p>}

          <div className="mt-6 flex justify-end gap-2">
            {isConfirm && (
              <button
                type="button"
                onClick={dismiss}
                className="btn-chunk bg-white"
                autoFocus
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={accept}
              className={`btn-chunk ${accentBtn}`}
              autoFocus={!isConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
