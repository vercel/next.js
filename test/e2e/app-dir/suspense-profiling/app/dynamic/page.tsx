import { Suspense } from 'react'
import { cookies, headers } from 'next/headers'
import { connection } from 'next/server'

// =============================================================================
// Case 1: cookies() - Request-specific data (no "use cache")
// =============================================================================
async function CookieContent() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  return (
    <div data-testid="cookie-content">
      Cookie count: {allCookies.length}
    </div>
  )
}

// =============================================================================
// Case 2: headers() - Request-specific data (no "use cache")
// =============================================================================
async function HeaderContent() {
  const headersList = await headers()
  const userAgent = headersList.get('user-agent') || 'Unknown'
  return (
    <div data-testid="header-content">
      User Agent: {userAgent.slice(0, 50)}...
    </div>
  )
}

// =============================================================================
// Case 3: connection() - Explicitly opt into dynamic rendering
// =============================================================================
async function ConnectionContent() {
  await connection()
  return (
    <div data-testid="connection-content">
      Connection established at: {Date.now()}
    </div>
  )
}

// =============================================================================
// Case 4: Static async content (for comparison)
// =============================================================================
async function StaticAsyncContent() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return (
    <div data-testid="static-async-content">
      This content is static async
    </div>
  )
}

export default function DynamicPage() {
  return (
    <div data-testid="dynamic-page-root">
      <h1>Dynamic API Test Cases</h1>
      <p>
        These cases demonstrate dynamic APIs that trigger dynamic rendering.
      </p>

      <section>
        <h2>1. cookies() - Request cookies</h2>
        <Suspense
          fallback={<div data-testid="cookie-loading">Loading cookies...</div>}
        >
          <CookieContent />
        </Suspense>
      </section>

      <section>
        <h2>2. headers() - Request headers</h2>
        <Suspense
          fallback={<div data-testid="header-loading">Loading headers...</div>}
        >
          <HeaderContent />
        </Suspense>
      </section>

      <section>
        <h2>3. connection() - Explicit dynamic opt-in</h2>
        <Suspense
          fallback={
            <div data-testid="connection-loading">Loading connection...</div>
          }
        >
          <ConnectionContent />
        </Suspense>
      </section>

      <section>
        <h2>4. Static async content (for comparison)</h2>
        <Suspense
          fallback={
            <div data-testid="static-async-loading">Loading static...</div>
          }
        >
          <StaticAsyncContent />
        </Suspense>
      </section>
    </div>
  )
}
