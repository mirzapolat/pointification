import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const refreshDetails = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) { setDetails(null); return }
    setDetailsLoading(true)
    const { data } = await supabase
      .from('user_details')
      .select('organization, role, intended_use, details_completed_at, onboarding_completed_at')
      .eq('id', uid)
      .maybeSingle()
    setDetails(data ?? null)
    setDetailsLoading(false)
  }, [session?.user?.id])

  useEffect(() => { refreshDetails() }, [refreshDetails])

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    details,
    detailsLoading,
    refreshDetails,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, displayName) =>
      supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: (displayName ?? '').trim() || null } }
      }),
    verifySignupOtp: (email, token) =>
      supabase.auth.verifyOtp({ email, token, type: 'signup' }),
    resendSignupOtp: (email) =>
      supabase.auth.resend({ type: 'signup', email }),
    signOut: () => supabase.auth.signOut()
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
