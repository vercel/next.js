import { scheduleLoad } from '../actions'
import { DashboardContent } from './DashboardContent'

// Mirrors the real /dashboard (the "Расписание" nav target): a force-dynamic route
// whose client content fetches on mount. It is prefetched by the Navbar from other
// pages, so its client fetch can run (and fail transiently) off-screen.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  await scheduleLoad(200)
  return <DashboardContent />
}
