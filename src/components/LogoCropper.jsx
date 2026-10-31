import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import Cropper from 'react-easy-crop'

// Uploaded logos are re-encoded in the browser, so the server only ever sees
// a tidy, right-sized image.
const MAX_SIDE = 1024
const MAX_BYTES = 1.9 * 1024 * 1024

const ASPECTS = [
  { id: 'square', label: 'Square', ratio: 1, icon: <span className="w-4 h-4 rounded-[4px] border-2 border-current block" /> },
  { id: 'wide', label: 'Wide', ratio: 2, icon: <span className="w-6 h-3 rounded-[4px] border-2 border-current block" /> },
  { id: 'original', label: 'Original', ratio: null, icon: <span className="w-5 h-4 rounded-[4px] border-2 border-dashed border-current block" /> },
]

/**
 * Full-screen crop dialog for game logos: drag to position, pinch / scroll /
 * slider to zoom (zooming out below "fit" adds transparent breathing room),
 * rotate in 90° steps, and pick a frame. Resolves to a WebP (or PNG) Blob via
 * `onApply`.
 */
export default function LogoCropper({
  src,
  vector = false,
  badgeShape = 'circle',
  initialAspect = 'square',
  onCancel,
  onApply,
  onSkip,          // optional: upload the original file untouched
}) {
  const [aspectId, setAspectId] = useState(initialAspect)
  const [natural, setNatural] = useState(null)        // { w, h }
  const [rotation, setRotation] = useState(0)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState(null)              // cropped area in source pixels
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const applyRef = useRef(null)

  const turned = rotation % 180 !== 0
  const mediaRatio = natural ? (turned ? natural.h / natural.w : natural.w / natural.h) : 1
  const aspect = ASPECTS.find(a => a.id === aspectId)?.ratio ?? mediaRatio
  // Zoom at which the *whole* image fits inside the frame — the right default
  // for logos, where cutting off a wordmark is the last thing anyone wants.
  const round = aspectId === 'square' && badgeShape === 'circle'
  const boxFit = Math.min(aspect / mediaRatio, mediaRatio / aspect, 1)
  // In a circle, a clearly non-square logo has to fit by its diagonal or the
  // corners get clipped. Near-square logos (often round themselves) keep the
  // box fit so they fill the badge.
  const squareness = Math.min(mediaRatio, 1 / mediaRatio)
  const fitZoom = round && squareness < 0.8 ? boxFit / Math.hypot(1, squareness) : boxFit
  const minZoom = Math.max(0.1, fitZoom * 0.5)
  const maxZoom = 6

  const fit = useCallback(() => {
    setZoom(fitZoom)
    setCrop({ x: 0, y: 0 })
  }, [fitZoom])

  // Re-frame whenever the frame or the image orientation changes.
  useEffect(() => { if (natural) fit() }, [natural, aspectId, rotation]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lock page scroll and route Escape/Enter to the dialog, ahead of the
  // settings page's own Escape-to-close handler.
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cancelRef.current() }
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); applyRef.current?.() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  const apply = async () => {
    if (!area || busy) return
    setBusy(true)
    setError(null)
    try {
      const blob = await renderCrop(src, area, rotation, vector)
      await onApply(blob)
    } catch (err) {
      setError(err?.message || 'Could not crop that image.')
      setBusy(false)
    }
  }
  applyRef.current = apply

  const zoomPct = useMemo(() => Math.round(zoom * 100), [zoom])
  const nudge = (factor) => setZoom(z => clamp(z * factor, minZoom, maxZoom))

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] bg-ink/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6 sm:pb-safe sm:[--pb:1.5rem]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby="crop-title"
        className="w-full sm:max-w-xl bg-white border-2 border-ink rounded-t-3xl sm:rounded-3xl shadow-chunk overflow-hidden flex flex-col max-h-[100dvh]"
        initial={{ y: 60, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b-2 border-ink">
          <div className="min-w-0">
            <h2 id="crop-title" className="font-display text-xl font-bold leading-tight">Crop your logo</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel"
            className="w-10 h-10 shrink-0 rounded-xl border-2 border-ink bg-white grid place-items-center hover:bg-candy-pink hover:text-white transition disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {/* Crop stage */}
        <div className="relative h-[min(42dvh,400px)] sm:h-[min(52dvh,400px)] min-h-[220px] shrink-0 bg-checker select-none touch-none">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            minZoom={minZoom}
            maxZoom={maxZoom}
            zoomSpeed={0.4}
            cropShape={round ? 'round' : 'rect'}
            showGrid={!round}
            restrictPosition={zoom >= 1}
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, px) => setArea(px)}
            onMediaLoaded={(m) => setNatural({ w: m.naturalWidth, h: m.naturalHeight })}
            style={{
              containerStyle: { background: 'transparent' },
              cropAreaStyle: { border: '3px solid #fff', color: 'rgba(15,15,18,0.55)' },
            }}
          />
          {!natural && (
            <div className="absolute inset-0 grid place-items-center font-display text-lg animate-pulse">loading…</div>
          )}
        </div>

        {/* Controls */}
        <div className="px-5 pt-4 pb-3 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Frame" className="flex gap-1 p-1 rounded-2xl border-2 border-ink bg-cream">
              {ASPECTS.map(a => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={aspectId === a.id}
                  onClick={() => setAspectId(a.id)}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl font-display font-semibold text-sm transition ${
                    aspectId === a.id ? 'bg-ink text-white' : 'hover:bg-white'
                  }`}
                >
                  <span className="hidden sm:block">{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRotation(r => (r + 90) % 360)}
              className="ml-auto w-10 h-10 rounded-xl border-2 border-ink bg-white grid place-items-center hover:bg-candy-yellow transition"
              aria-label="Rotate 90°"
              title="Rotate 90°"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => nudge(1 / 1.15)}
              disabled={zoom <= minZoom + 1e-3}
              className="w-10 h-10 shrink-0 rounded-xl border-2 border-ink bg-white font-display text-xl font-bold hover:bg-candy-yellow transition disabled:opacity-40"
              aria-label="Zoom out"
            >−</button>
            <input
              type="range"
              min={minZoom} max={maxZoom} step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 min-w-0 accent-candy-pink py-2"
              aria-label="Zoom"
              aria-valuetext={`${zoomPct}%`}
            />
            <button
              type="button"
              onClick={() => nudge(1.15)}
              disabled={zoom >= maxZoom - 1e-3}
              className="w-10 h-10 shrink-0 rounded-xl border-2 border-ink bg-white font-display text-xl font-bold hover:bg-candy-mint transition disabled:opacity-40"
              aria-label="Zoom in"
            >+</button>
            <button
              type="button"
              onClick={fit}
              className="shrink-0 px-3 h-10 rounded-xl border-2 border-ink bg-white font-display font-semibold text-sm hover:bg-cream transition"
              title="Show the whole image"
            >Fit</button>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-xl border-2 border-ink bg-candy-pink/30 text-sm">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-safe [--px:1.25rem] pt-3 pb-safe sm:[--pb:1rem] border-t-2 border-ink bg-cream">
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={busy}
              className="text-sm font-semibold text-ink/70 hover:text-ink underline decoration-2 underline-offset-4 decoration-ink/30 hover:decoration-ink disabled:opacity-40"
              title="Upload the image exactly as it is"
            >Skip cropping</button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onCancel} disabled={busy} className="btn-chunk bg-white px-4 py-2.5 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={apply} disabled={busy || !area} className="btn-chunk bg-candy-mint px-5 py-2.5 disabled:opacity-50">
              {busy ? 'Saving…' : 'Use logo'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image.'))
    img.src = src
  })
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Draws the chosen region (in source pixels, relative to the rotated image's
 * bounding box — react-easy-crop's convention) onto a canvas and encodes it.
 * Parts of the region past the image edge stay transparent.
 */
async function renderCrop(src, area, rotation, vector) {
  const img = await loadImage(src)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) throw new Error('That image has no size we can read. Try a PNG instead.')
  const turned = rotation % 180 !== 0
  const boxW = turned ? h : w
  const boxH = turned ? w : h

  const longest = Math.max(area.width, area.height)
  // Never upscale bitmaps (it only adds blur); vectors render crisp at any size.
  let scale = vector ? MAX_SIDE / longest : Math.min(1, MAX_SIDE / longest)

  for (let attempt = 0; attempt < 5; attempt++) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(area.width * scale))
    canvas.height = Math.max(1, Math.round(area.height * scale))
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.scale(scale, scale)
    ctx.translate(-area.x, -area.y)
    ctx.translate(boxW / 2, boxH / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.drawImage(img, -w / 2, -h / 2, w, h)

    // WebP keeps transparency at a fraction of PNG's size; browsers that
    // can't encode it hand back a PNG instead.
    const blob = (await toBlob(canvas, 'image/webp', 0.92)) || (await toBlob(canvas, 'image/png'))
    if (!blob) throw new Error('Your browser could not export the image.')
    if (blob.size <= MAX_BYTES) return blob
    scale *= 0.75
  }
  throw new Error('That image is too detailed to fit under 2MB. Try cropping tighter.')
}
