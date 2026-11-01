import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile } from './supabase'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>(null as unknown as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data as Profile | null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      // defer: calling supabase inside this callback can deadlock the auth lock
      setTimeout(() => loadProfile(s?.user.id), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const value: AuthState = {
    session,
    profile,
    loading,
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => {
      await supabase.auth.signOut()
      setProfile(null)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

/** Normalise UK-style input to E.164 (+44…); other numbers are kept with their leading +. */
export function normaliseMobile(input: string) {
  const digits = input.replace(/[^0-9+]/g, '')
  if (!digits) return ''
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('00')) return '+' + digits.slice(2)
  if (digits.startsWith('0')) return '+44' + digits.slice(1)
  return '+' + digits
}
