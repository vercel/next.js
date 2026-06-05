// ⛔ MESSY: a top-level auth gate (`await cookies()` → redirect) plus per-user
// data, all at the top with no boundary. The cookie read gates the whole page,
// and the redirect runs during prerender. (Fix: lever 2 — render the static
// frame unconditionally, move the gate into a <Suspense fallback={null}> child
// so the redirect only fires at request-time resume; lever 1 — stream the
// per-user stats behind their own <Suspense> with a real skeleton.)
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUserStats } from '@/lib/data'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('uid')?.value
  if (!userId) redirect('/')

  const stats = await getUserStats(userId)

  return (
    <section>
      <h1>Dashboard</h1>
      <p>
        Welcome back, {userId}. Visits: {stats.visits}
      </p>
    </section>
  )
}
