// Sign in with mobile number + password.
// Resolves the mobile number to the account email server-side (never exposed to
// the client), then performs a normal password sign-in and returns the session.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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
  if (!mobile || !password) return json({ error: 'Mobile number and password are required' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: email } = await admin.rpc('email_for_mobile', { m: mobile })

  const invalid = () => json({ error: 'Invalid mobile number or password' }, 401)
  if (!email) return invalid()

  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) return invalid()

  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
})
