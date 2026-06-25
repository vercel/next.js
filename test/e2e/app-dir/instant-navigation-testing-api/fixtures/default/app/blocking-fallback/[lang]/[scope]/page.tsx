import { cookies } from 'next/headers'

// The deeper, blocking segment of the fallback route: reads request-time
// `cookies()` and has no <Suspense> of its own, so it has no static shell.
// Under instant() the navigation here must stay parked on the committed parent;
// the cookie value must not commit while the lock is held.
export default function ScopePage() {
  return (
    <div>
      <h1 data-testid="blocking-scope-title">Scope</h1>
      <Secret />
    </div>
  )
}

async function Secret() {
  const cookieStore = await cookies()
  return (
    <div data-testid="blocking-secret">
      testCookie: {cookieStore.get('testCookie')?.value ?? 'not set'}
    </div>
  )
}
