import Link from 'next/link'

export default function DashboardLayout({
  children,
  stats,
  activity,
}: LayoutProps<'/dashboard'>) {
  return (
    <div data-layout="dashboard">
      <nav aria-label="Dashboard">
        <Link href="/dashboard">Overview</Link>
        {' · '}
        <Link href="/dashboard/projects/relay">Relay API</Link>
        {' · '}
        <Link href="/">Back to site</Link>
      </nav>
      <section aria-label="Stats">{stats}</section>
      <main>{children}</main>
      <aside aria-label="Activity">{activity}</aside>
    </div>
  )
}
