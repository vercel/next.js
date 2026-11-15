import { cookies, headers } from 'next/headers'
import { getProjectTotals } from '@/lib/projects'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const requestHeaders = await headers()
  const member = cookieStore.get('member')?.value ?? 'Guest'
  const team = cookieStore.get('team')?.value ?? 'Community'
  const region = requestHeaders.get('x-region') ?? 'global'
  const totals = await getProjectTotals()

  return (
    <main>
      <h1>Workspace</h1>
      <p>Welcome, {member}</p>
      <p>Team: {team}</p>
      <p>Region: {region}</p>
      <p>{totals.active} active projects</p>
    </main>
  )
}
