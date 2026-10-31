import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { usePwa, promptInstall, applyUpdate, dismissUpdate, isIosSafari } from '../lib/pwa.js'
import { track } from '../lib/analytics.js'

const InstallIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="2" width="14" height="20" rx="3" />
    <path d="M12 7v7" /><path d="m9 11 3 3 3-3" /><path d="M10 18h4" />
  </svg>
)

/**
 * "Install app" header button. Shows only when the browser can install the
 * app (Chromium's prompt) or on iOS Safari, where it explains the Share-sheet
 * route instead. Hidden once running as an installed app.
 */
export function InstallButton({ className = '' }) {
  const { installEvent, installed } = usePwa()
  const [ios, setIos] = useState(false)
  const [help, setHelp] = useState(false)
  useEffect(() => { setIos(isIosSafari()) }, [])

  if (installed || (!installEvent && !ios)) return null

  const onClick = async () => {
    if (installEvent) {
      const outcome = await promptInstall()
      track('pwa-install', { outcome })
    } else {
      setHelp(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label="Install app"
        title="Install app"
        className={`btn-chunk bg-candy-yellow text-sm p-2 md:px-4 md:py-2 inline-flex items-center gap-2 ${className}`}
      >
        <InstallIcon />
        <span className="hidden md:inline">Install</span>
      </button>
      <IosInstallSheet open={help} onClose={() => setHelp(false)} />
    </>
  )
}

function IosInstallSheet({ open, onClose }) {
  const closeRef = useRef(null)
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center px-safe [--px:0.75rem] pt-3 pb-safe [--pb:0.75rem] sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="ios-install-title"
            className="card-chunk w-full max-w-sm p-6"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <img src="/icons/icon-192.png" alt="" className="w-12 h-12" />
              <div>
                <h2 id="ios-install-title" className="font-display text-xl font-bold leading-tight">Add to Home Screen</h2>
                <p className="text-xs text-ink/60">Opens full screen, like a real app.</p>
              </div>
            </div>
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <span className="w-7 h-7 shrink-0 rounded-full border-2 border-ink bg-candy-mint grid place-items-center font-display font-bold text-xs">1</span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  Tap
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border-2 border-ink bg-white font-semibold">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
                    Share
                  </span>
                  in Safari's toolbar
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-7 h-7 shrink-0 rounded-full border-2 border-ink bg-candy-yellow grid place-items-center font-display font-bold text-xs">2</span>
                <span>Choose <b>Add to Home Screen</b></span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-7 h-7 shrink-0 rounded-full border-2 border-ink bg-candy-pink text-white grid place-items-center font-display font-bold text-xs">3</span>
                <span>Tap <b>Add</b> — done!</span>
              </li>
            </ol>
            <button ref={closeRef} type="button" onClick={onClose} className="btn-chunk bg-white w-full mt-5">Got it</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Bottom toast offering to reload into a freshly deployed version. */
export function UpdateToast() {
  const { updateReady } = usePwa()
  return (
    <AnimatePresence>
      {updateReady && (
        <motion.div
          role="status"
          className="fixed z-[70] inset-x-0 bottom-safe px-safe flex justify-center pointer-events-none"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <div className="card-chunk pointer-events-auto w-full max-w-md flex items-center gap-3 p-3 pl-4">
            <span className="text-xl" aria-hidden="true">✨</span>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-sm">New version ready</div>
              <div className="text-xs text-ink/60">Reload to get the latest Pointification.</div>
            </div>
            <button type="button" onClick={dismissUpdate} className="text-xs font-semibold text-ink/60 hover:text-ink px-2">Later</button>
            <button type="button" onClick={applyUpdate} className="btn-chunk bg-candy-mint text-sm px-3 py-2">Reload</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
