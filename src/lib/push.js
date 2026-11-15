// Browser side of push notifications: permission, subscribing this device to
// the server's VAPID key, and unsubscribing. The global on/off switch is the
// account's `notify_points`; per-game mutes live on the server too.
import * as api from './api'

const isBrowser = typeof window !== 'undefined'

/** 'unsupported' | 'needs-install' | 'ok' */
export function pushSupport() {
  if (!isBrowser) return 'unsupported'
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (hasApis) return 'ok'
  // iOS only exposes Web Push to apps added to the Home Screen.
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  return iOS ? 'needs-install' : 'unsupported'
}

function base64UrlToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null
  // In dev there is no worker (see registerPwa); don't wait forever for one.
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? navigator.serviceWorker.ready : null
}

/** Whether this browser currently holds a push subscription. */
export async function isSubscribed() {
  if (pushSupport() !== 'ok') return false
  const reg = await registration()
  return !!(await reg?.pushManager.getSubscription())
}

/**
 * Asks for permission (if needed), subscribes this device and registers it
 * with the server. Returns `{ error }` with a human message on failure.
 */
export async function subscribeThisDevice() {
  if (pushSupport() !== 'ok') return { error: 'This browser does not support notifications.' }
  const reg = await registration()
  if (!reg) return { error: 'Notifications are not available here yet. Reload the page and try again.' }

  const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (result !== 'granted') {
    return { error: 'Notifications are blocked. Allow them for this site in your browser settings.' }
  }

  const { data, error } = await api.getPushConfig()
  if (error) return { error: error.message }

  try {
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(data.public_key),
      })
    }
    const { error: saveError } = await api.savePushSubscription(sub.toJSON())
    if (saveError) return { error: saveError.message }
    return { error: null }
  } catch (err) {
    return { error: err?.message || 'Could not turn on notifications.' }
  }
}

export async function unsubscribeThisDevice() {
  if (pushSupport() !== 'ok') return
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await api.removePushSubscription(sub.endpoint)
  await sub.unsubscribe().catch(() => {})
}
