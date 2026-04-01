import { createClient } from '@supabase/supabase-js'

// Admin client — bypasses RLS.
// Used ONLY inside cached functions where the userId is already verified.
// Never expose this client to uncached or unauthenticated code paths.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
