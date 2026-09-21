'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── AUTH CHECK ─────────────────────────────────────────
// This function runs on EVERY request.
// It is NOT cached. It must NOT be cached.
//
// getClaims() validates the JWT locally — no network call.
// If the JWT is invalid, the user is not authenticated.
// ────────────────────────────────────────────────────────

export async function getCurrentUserId(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims?.sub) {
    redirect('/login')
  }

  return data.claims.sub
}
