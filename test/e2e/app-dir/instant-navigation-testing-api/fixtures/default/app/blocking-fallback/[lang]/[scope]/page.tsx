import { cookies } from 'next/headers'
import { connection } from 'next/server'

// The deeper, blocking segment of the fallback route: awaits the uncovered
// `scope` param and reads request-time `cookies()`, and has no <Suspense> of
// its own, so it has no static shell. Under instant() the navigation here must
// stay parked on the committed parent; neither the title nor the cookie value
// may commit while the lock is held.
export default async function ScopePage({
  params,
}: {
  params: Promise<{ lang: string; scope: string }>
}) {
  // Await the uncovered `scope` fallback param to keep this segment parked
  // under instant(). The app shell is allowed to read `cookies()` without
  // blocking, so gating only on cookies would make parking depend on a race:
  // the title leaks when the cookie-bearing app-shell prefetch commits this
  // segment, but stays hidden when the empty static speculative prefetch
  // commits first. Awaiting the withheld param removes the title from both
  // prefetches, so it stays parked until the lock releases no matter which one
  // wins. This app-shell-versus-speculative-prefetch race is a known, likely
  // temporary limitation; see the note on the `cookies in the instant shell`
  // describe block for the related case and the planned fix.
  await params

  return (
    <div>
      <h1 data-testid="blocking-scope-title">Scope</h1>
      <Secret />
    </div>
  )
}

async function Secret() {
  // `await connection()` makes the segment strictly dynamic so no prefetch can
  // render it, which is what keeps it deferred under the instant lock.
  // `cookies()` alone would not suffice: the app-shell prefetch carries cookies
  // and could render the segment, while the empty static speculative prefetch
  // renders nothing here, so whichever reaches the segment cache first would
  // decide whether the content appears. `connection()` resolves only with a
  // real request, which no prefetch has.
  await connection()
  const cookieStore = await cookies()
  return (
    <div data-testid="blocking-secret">
      testCookie: {cookieStore.get('testCookie')?.value ?? 'not set'}
    </div>
  )
}
