'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Re-renders the current page without redirecting. When dispatched in the
// same tick as a navigation, the action derives its state from the
// navigation's not-yet-committed state at the same URL — the transition
// lifecycle must follow that derivation so the navigation still reports its
// commit.
export async function revalidateNoPrefetch() {
  revalidatePath('/no-prefetch')
}

// Redirects to a URL no in-flight navigation targeted. The redirected
// state's commit must not be attributed to a pending navigation.
export async function redirectToSomePage() {
  redirect('/some-page')
}
