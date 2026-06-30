import { scheduleLoad } from '../../../actions'
import { ScheduleManager } from './ScheduleManager'

// Mirrors the real schedule page: force-dynamic server component that does several
// async loads per request before rendering the (skeleton-gated) client manager.
export const dynamic = 'force-dynamic'

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // ~5 server-side loads, like validateSession + getStaff + Promise.all([...]).
  // Total ~1200ms: a wide pending-navigation window. The loading.tsx boundary
  // commits the URL to the schedule route immediately, then this segment streams
  // in behind it — and that is the window where a Server Action settling from the
  // just-mounted CompanyProvider drops the swap (vercel/next.js#86151).
  await scheduleLoad(400)
  await Promise.all([scheduleLoad(800), scheduleLoad(800), scheduleLoad(800)])

  return <ScheduleManager staffId={id} />
}
