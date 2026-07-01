import { StaffTableWrapper } from './StaffTableWrapper'

// force-dynamic server component that renders only the client table wrapper.
export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Staff</h1>
      <StaffTableWrapper />
    </div>
  )
}
