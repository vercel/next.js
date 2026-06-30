import { scheduleLoad } from '../../actions'

// Mirrors the real app's staff/[id]/layout: a force-dynamic INTERMEDIATE layout that does
// a few sequential server awaits (validateSession -> getStaff -> getCompanyStaff) before
// rendering chrome (staff selector + profile/schedule tabs) around its {children} page
// segment. This is the boundary at which the real app's "Signature B" appeared: the layout
// committed (selector + tabs + page title) but the child schedule segment rendered empty.
export const dynamic = 'force-dynamic'

export default async function StaffIdLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // ~3 sequential server awaits, like validateSession -> getStaff -> getCompanyStaff.
  await scheduleLoad(150)
  await scheduleLoad(150)
  await scheduleLoad(150)

  return (
    <div data-testid="staff-layout">
      <h2>Управление сотрудником</h2>
      <div data-testid="staff-selector">Сотрудник #{id}</div>
      <nav data-testid="staff-tabs">
        <a href={`/staff/${id}/profile`}>Личные данные</a>
        {' | '}
        <a href={`/staff/${id}/schedule`}>Расписание</a>
      </nav>
      <div>{children}</div>
    </div>
  )
}
