import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn('[pointification] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.')
}

export const supabase = createClient(url ?? 'http://localhost', anon ?? 'public-anon', {
  auth: { persistSession: true, autoRefreshToken: true }
})

if (typeof window !== 'undefined') window.supabase = supabase
