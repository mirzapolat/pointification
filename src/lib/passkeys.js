// Browser half of the WebAuthn ceremonies. Each helper fetches options from
// the server, asks the browser/OS for the passkey, and posts the result back.
// Like api.js, everything resolves to `{ data, error }` and never throws.
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import * as api from './api'

export const passkeysSupported = () => {
  try { return browserSupportsWebAuthn() } catch { return false }
}

function describe(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
    return 'Passkey request was cancelled.'
  }
  if (err?.name === 'InvalidStateError') return 'This device already has a passkey for your account.'
  return err?.message || 'Passkey request failed.'
}

async function ceremony(getOptions, start, finish) {
  const { data: optionsJSON, error } = await getOptions()
  if (error) return { data: null, error }
  let response
  try {
    response = await start({ optionsJSON })
  } catch (err) {
    return { data: null, error: new Error(describe(err)) }
  }
  return finish(response)
}

export const signInWithPasskey = () =>
  ceremony(api.passkeyLoginOptions, startAuthentication, api.passkeyLogin)

export const verifyMfaWithPasskey = () =>
  ceremony(api.passkeyMfaOptions, startAuthentication, api.passkeyMfa)

export const addPasskey = (name) =>
  ceremony(api.passkeyRegistrationOptions, startRegistration, (response) => api.registerPasskey(response, name))
