import { Suspense } from 'react'
import { cookies, headers } from 'next/headers'

// Component that uses cookies - triggers dynamic API
async function CookieCounter() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  return (
    <div data-testid="cookie-counter">
      Cookie count: {allCookies.length}
    </div>
  )
}

// Component that uses headers - triggers dynamic API
async function HeaderInfo() {
  const headersList = await headers()
  const userAgent = headersList.get('user-agent') || 'Unknown'
  return (
    <div data-testid="header-info">
      User Agent: {userAgent.slice(0, 50)}...
    </div>
  )
}

// Regular async component (no dynamic API)
async function SlowComponent({ id, delay }: { id: string; delay: number }) {
  await new Promise((resolve) => setTimeout(resolve, delay))
  return <div data-testid={`content-${id}`}>Content {id} loaded</div>
}

// Wrapper components to make boundaries identifiable
function CookieSection() {
  return (
    <Suspense fallback={<div data-testid="cookies-loading">Loading cookies...</div>}>
      <CookieCounter />
    </Suspense>
  )
}

function HeaderSection() {
  return (
    <Suspense fallback={<div data-testid="headers-loading">Loading headers...</div>}>
      <HeaderInfo />
    </Suspense>
  )
}

function RegularSection() {
  return (
    <Suspense fallback={<div data-testid="regular-loading">Loading regular...</div>}>
      <SlowComponent id="regular" delay={100} />
    </Suspense>
  )
}

export default function DynamicPage() {
  return (
    <div data-testid="dynamic-page-root">
      <h1>Dynamic API Test</h1>

      <section>
        <h2>Dynamic APIs (will opt out of static rendering)</h2>
        <CookieSection />
        <HeaderSection />
      </section>

      <section>
        <h2>Regular Async (no dynamic API)</h2>
        <RegularSection />
      </section>
    </div>
  )
}
