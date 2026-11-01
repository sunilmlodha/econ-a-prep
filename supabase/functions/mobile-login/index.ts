// Sign in with mobile number + password.
// Resolves the mobile number to the account email server-side (never exposed to
// the client), then performs a normal password sign-in and returns the session.
// Failed attempts are throttled per mobile number, and unknown numbers take the
// same path as wrong passwords so timing doesn't reveal which numbers exist.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_FAILURES = 5
const WINDOW_MINUTES = 15

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let mobile = '', password = ''
  try {
    ;({ mobile, password } = await req.json())
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  mobile = String(mobile ?? '').replace(/[^0-9+]/g, '')
  if (!mobile || !password) return json({ error: 'Mobile number and password are required' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString()
  const { count } = await admin.from('login_failures').select('*', { count: 'exact', head: true })
    .eq('mobile', mobile).gte('created_at', since)
  if ((count ?? 0) >= MAX_FAILURES) {
    return json({ error: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes or sign in with email.` }, 429)
  }

  const { data: email } = await admin.rpc('email_for_mobile', { m: mobile })
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  // unknown numbers still make a (failing) sign-in call so response timing matches
  const { data, error } = await anon.auth.signInWithPassword({
    email: (email as string | null) ?? `no-account-${crypto.randomUUID()}@invalid.local`,
    password,
  })

  if (error || !data.session || !email) {
    await admin.from('login_failures').insert({ mobile })
    return json({ error: 'Invalid mobile number or password' }, 401)
  }
  await admin.from('login_failures').delete().eq('mobile', mobile)
  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
})
