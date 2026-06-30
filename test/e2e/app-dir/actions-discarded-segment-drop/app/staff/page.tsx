import { StaffTableWrapper } from './StaffTableWrapper'

// Mirrors the real /staff page: force-dynamic server component that renders only
// the client table wrapper (no rows server-side).
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Сотрудники' }

export default async function StaffPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Сотрудники</h1>
      <StaffTableWrapper />
    </div>
  )
}
