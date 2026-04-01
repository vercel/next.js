'use server'

import { cacheLife } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── CACHED DATA FETCH ──────────────────────────────────
// This function IS cached.
//
// Security model:
//   1. The caller (page/component) must verify auth FIRST
//      by calling getCurrentUserId() — which is NOT cached.
//   2. The userId parameter becomes part of the cache key.
//      Different users get different cache entries.
//   3. The admin client bypasses RLS, but we filter by userId
//      explicitly — so one user cannot access another's data.
//   4. If you prefer RLS enforcement, use the per-request
//      server client instead (see alternative below).
//
// Why admin client + explicit filter instead of RLS?
//   - The cached function cannot read cookies (no request context).
//   - The admin client doesn't need cookies.
//   - We filter by the verified userId from the auth check.
//   - This is safe because userId was verified before this runs.
// ────────────────────────────────────────────────────────

export async function getProjects(userId: string) {
  'use cache'
  cacheLife('minutes')

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch projects: ${error.message}`)
  }

  return data
}

export async function getProjectCount(userId: string) {
  'use cache'
  cacheLife('hours')

  const supabase = createAdminClient()

  const { count, error } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', userId)

  if (error) {
    throw new Error(`Failed to count projects: ${error.message}`)
  }

  return count ?? 0
}

// ─── ALTERNATIVE: RLS-enforced query (not cached) ───────
// If you want RLS instead of explicit filtering,
// you CANNOT use "use cache" because the Supabase client
// needs request cookies to identify the user for RLS.
//
//   import { createClient } from '@/lib/supabase/server'
//
//   export async function getProjectsWithRLS() {
//     const supabase = await createClient()
//     const { data } = await supabase
//       .from('projects')
//       .select('id, name, created_at')
//     return data
//   }
