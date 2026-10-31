// Progressive-web-app plumbing: service worker registration, the install
// prompt, "new version available", and keeping the screen awake while a
// scoreboard is on display.
//
// Everything here is SSR-safe — the public pages are pre-rendered in Node, so
// nothing touches `window` at import time.

import { useEffect, useSyncExternalStore } from 'react'

const isBrowser = typeof window !== 'undefined'

// --- Tiny external store ---------------------------------------------------

let state = {
  installEvent: null,      // deferred `beforeinstallprompt`
  installed: false,        // running as an installed app (or just installed)
  updateReady: false,      // a new service worker is waiting
}
const listeners = new Set()
const set = (patch) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l) }
const snapshot = () => state

export const usePwa = () => useSyncExternalStore(subscribe, snapshot, snapshot)

// --- Environment -----------------------------------------------------------

export function isStandalone() {
  if (!isBrowser) return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

/** iOS/iPadOS Safari has no install prompt — users add it from the Share sheet. */
export function isIosSafari() {
  if (!isBrowser) return false
  const ua = window.navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const webkitOnly = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return iOS && webkitOnly
}

// --- Registration ----------------------------------------------------------

let waitingWorker = null

export function registerPwa() {
  if (!isBrowser) return
  set({ installed: isStandalone() })

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    set({ installEvent: e })
  })
  window.addEventListener('appinstalled', () => set({ installEvent: null, installed: true }))

  // Dev runs on Vite's server; a worker there would only cache stale modules.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First install claims the page silently; only reload for real updates.
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const markWaiting = (worker) => {
        waitingWorker = worker
        set({ updateReady: true })
      }
      if (reg.waiting && navigator.serviceWorker.controller) markWaiting(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) markWaiting(worker)
        })
      })
      // Installed apps can stay open for days — look for updates when the
      // app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    } catch (err) {
      console.warn('[pwa] service worker registration failed', err)
    }
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

export async function promptInstall() {
  const e = state.installEvent
  if (!e) return 'unavailable'
  e.prompt()
  const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' }))
  set({ installEvent: null, installed: outcome === 'accepted' || state.installed })
  return outcome
}

export function applyUpdate() {
  if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  else if (isBrowser) window.location.reload()
}

export function dismissUpdate() {
  set({ updateReady: false })
}

// --- Screen wake lock ------------------------------------------------------

/**
 * Keeps the screen on while `active` — a scoreboard on a TV or tablet should
 * not dim halfway through a round. The browser drops the lock when the tab is
 * hidden, so it is re-acquired whenever the page becomes visible again.
 */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || !isBrowser || !('wakeLock' in navigator)) return
    let sentinel = null
    let cancelled = false
    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== 'visible') return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) { lock.release().catch(() => {}); return }
        sentinel = lock
        lock.addEventListener('release', () => { if (sentinel === lock) sentinel = null })
      } catch {
        // Denied (battery saver, unsupported context) — nothing to do.
      }
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [active])
}
