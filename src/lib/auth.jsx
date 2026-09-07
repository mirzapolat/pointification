import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as api from './api'

const AuthCtx = createContext(null)

/**
 * Holds the signed-in user, whether they still owe a 2FA code, and their
 * onboarding progress. All three arrive from a single /api/auth/session call,
 * so there is one loading flag rather than one per concern.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(true)

  const applySession = useCallback((payload) => {
    setUser(payload?.user ?? null)
    setMfaRequired(!!payload?.mfa_required)
    setDetails(payload?.details ?? null)
    setLoading(false)
    setDetailsLoading(false)
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await api.getSession()
    applySession(data)
    return data
  }, [applySession])

  useEffect(() => { refresh() }, [refresh])

  const refreshDetails = useCallback(async () => {
    setDetailsLoading(true)
    const { data } = await api.getUserDetails()
    setDetails(data ?? null)
    setDetailsLoading(false)
  }, [])

  /** Runs an auth call, then re-reads the session so the whole app updates. */
  const withRefresh = useCallback(async (call) => {
    const { error } = await call()
    if (error) return { error }
    await refresh()
    return { error: null }
  }, [refresh])

  const value = {
    user,
    loading,
    mfaRequired,
    details,
    detailsLoading,
    refresh,
    refreshDetails,
    signIn: (email, password) => withRefresh(() => api.signIn(email, password)),
    signUp: (email, password, displayName) => withRefresh(() => api.signUp(email, password, displayName)),
    verifySignupCode: (email, code) => withRefresh(() => api.verifySignupCode(email, code)),
    resendSignupCode: (email) => api.resendSignupCode(email),
    verifyMfaCode: (code) => withRefresh(() => api.verifyMfaCode(code)),
    signOut: async () => {
      await api.signOut()
      setUser(null)
      setMfaRequired(false)
      setDetails(null)
    },
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
