import { connection } from 'next/server'

// This route is deliberately blocking: the whole point is that there is no
// Suspense boundary above the slow render. Under cache components (which
// fails the build for dynamic access outside <Suspense>) the test setup
// patches in `export const instant = false` — that config is only valid when
// cacheComponents is enabled, so it can't live here unconditionally.
export default async function Page() {
  // Keep this page dynamic so a prefetch can never satisfy a navigation to
  // it: every click must issue a dynamic request that runs this 2s delay.
  // (The link to this page also sets prefetch={false}.)
  await connection()
  // The delay blocks the *commit*, not just this subtree: there is no
  // Suspense boundary above this page (no loading.js, and the root layout
  // renders children directly), so React cannot commit the navigation with a
  // fallback — it keeps the previous page until this render resolves.
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return <h1 id="slow-page">Slow</h1>
}
