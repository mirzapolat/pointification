// Web Push for score changes. Who gets one: the game's owner and collaborators
// whose global switch (users.notify_points) is on and who haven't muted that
// game (game_notify_prefs), minus whoever made the change.
//
// VAPID keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when set, and are
// otherwise generated once and kept in the database, so push works with zero
// configuration and survives restarts (existing subscriptions stay valid).
import webpush from 'web-push'
import { all, get, run } from '../db.js'

function loadVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
  }
  const stored = get("SELECT value FROM app_settings WHERE key = 'vapid'")
  if (stored) {
    try { return JSON.parse(stored.value) } catch { /* regenerate below */ }
  }
  const keys = webpush.generateVAPIDKeys()
  run(`INSERT INTO app_settings (key, value) VALUES ('vapid', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`, JSON.stringify(keys))
  return keys
}

const vapid = loadVapid()
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:noreply@pointification.de',
  vapid.publicKey,
  vapid.privateKey,
)

export const vapidPublicKey = vapid.publicKey

// The server POSTs to subscription endpoints, so only accept the browsers'
// own push services — never an arbitrary URL (SSRF).
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com']
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com', '.wns.windows.com', '.push.services.mozilla.com']

/** True when `endpoint` is an https URL on a known browser push service. */
export function isAllowedPushEndpoint(endpoint) {
  let url
  try { url = new URL(String(endpoint)) } catch { return false }
  if (url.protocol !== 'https:' || url.username || url.password) return false
  if (url.port && url.port !== '443') return false
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some(s => host.endsWith(s))
}

/** Recipients for a change in `gameId`, excluding the actor. */
function recipients(gameId, actorId) {
  return all(
    `SELECT u.id FROM users u
      WHERE u.notify_points = 1
        AND u.id <> ?
        AND (u.id = (SELECT user_id FROM games WHERE id = ?)
             OR EXISTS (SELECT 1 FROM game_members m WHERE m.game_id = ? AND m.user_id = u.id))
        AND COALESCE((SELECT p.enabled FROM game_notify_prefs p WHERE p.game_id = ? AND p.user_id = u.id), 1) = 1`,
    actorId ?? '', gameId, gameId, gameId
  ).map(r => r.id)
}

async function sendTo(userIds, payload) {
  if (!userIds.length) return
  const subs = all(
    `SELECT * FROM push_subscriptions WHERE user_id IN (${userIds.map(() => '?').join(',')})`,
    ...userIds
  )
  const body = JSON.stringify(payload)
  await Promise.all(subs.map(async (s) => {
    // Re-check rows stored before the allowlist existed.
    if (!isAllowedPushEndpoint(s.endpoint)) {
      run('DELETE FROM push_subscriptions WHERE id = ?', s.id)
      return
    }
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 3600, urgency: 'normal' },
      )
    } catch (err) {
      // 404/410: the browser dropped this subscription — forget it.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        run('DELETE FROM push_subscriptions WHERE id = ?', s.id)
      } else {
        console.warn('[push] send failed:', err?.statusCode ?? err?.message ?? err)
      }
    }
  }))
}

/**
 * Fire-and-forget notification for a scored change. Never throws: a push
 * outage must not fail the request that changed the score.
 */
export function notifyPointChange({ log, team, actor }) {
  try {
    const game = get('SELECT id, name, deleted_at FROM games WHERE id = ?', log.game_id)
    if (!game || game.deleted_at) return
    const ids = recipients(game.id, actor?.id)
    if (!ids.length) return
    const who = actor?.display_name?.trim() || 'Someone'
    const amount = log.delta > 0 ? `+${log.delta}` : `−${Math.abs(log.delta)}`
    sendTo(ids, {
      title: game.name,
      body: `${who}: ${amount} for ${team.name} (now ${log.new_score})`,
      url: `/game/${game.id}`,
      // One notification per game; newer changes replace the older one.
      tag: `game-${game.id}`,
    }).catch((err) => console.warn('[push]', err))
  } catch (err) {
    console.warn('[push]', err)
  }
}
