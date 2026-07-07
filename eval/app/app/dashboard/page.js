import { Revenue } from './revenue-client'

// Server component: the shell is server-rendered, but the headline KPI is a
// client component whose value only exists AFTER hydration in a real browser.
// A `curl` of this route therefore sees the skeleton ("Loading…"), never the
// resolved figure — the classic browser-only state an agent cannot observe
// with an HTTP client.
export default function DashboardPage() {
  return (
    <main>
      <h1>Revenue Dashboard</h1>
      <p>
        Revenue this month: <Revenue />
      </p>
    </main>
  )
}
