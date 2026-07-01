import { scheduleLoad } from '../../actions'

// Intermediate force-dynamic layout: a few sequential server awaits before it
// renders chrome around the child schedule segment.
export const dynamic = 'force-dynamic'

export default async function StaffIdLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await scheduleLoad(150)
  await scheduleLoad(150)
  await scheduleLoad(150)
  return (
    <div data-testid="staff-layout">
      <div data-testid="staff-selector">Staff #{id}</div>
      <nav>
        <a href={`/staff/${id}/schedule`}>Schedule</a>
      </nav>
      <div>{children}</div>
    </div>
  )
}
