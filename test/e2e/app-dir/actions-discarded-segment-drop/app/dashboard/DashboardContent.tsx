'use client'

import { useEffect, useState } from 'react'
import { getCompanyStaff, scheduleLoad, Staff } from '../actions'

// Mirrors the real DashboardContent: a client component that fetches on mount and logs
// "[DashboardContent] Failed to fetch" on a transient drop — the log seen co-occurring
// with the spurious /staff bounce.
export function DashboardContent() {
  const [staff, setStaff] = useState<Staff[] | null>(null)

  useEffect(() => {
    getCompanyStaff()
      .then(setStaff)
      .catch((e) =>
        console.error('[DashboardContent] Failed to fetch dashboard data:', e)
      )
    // Trailing SLOW server action, still in-flight when the user clicks away to /staff.
    // Stands in for the real app's on-mount server actions (RQ refetch, provider fetches,
    // preloadAdjacentWeeks). router.refresh() REMOVED here to isolate its contribution
    // to the #86151 segment-drop while keeping loading.tsx + an in-flight action.
    scheduleLoad(1500).catch(() => {})
  }, [])

  return (
    <div data-testid="dashboard-content">
      <h1>Расписание (dashboard)</h1>
      <p>{staff ? `${staff.length} staff` : 'loading…'}</p>
    </div>
  )
}
