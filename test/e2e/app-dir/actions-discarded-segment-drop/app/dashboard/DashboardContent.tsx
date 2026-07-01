'use client'

import { useEffect, useState } from 'react'
import { getCompanyStaff, scheduleLoad, Staff } from '../actions'

// Fetches on mount and fires a trailing slow action that is still in flight when
// the user navigates away to /staff.
export function DashboardContent() {
  const [staff, setStaff] = useState<Staff[] | null>(null)

  useEffect(() => {
    getCompanyStaff().then(setStaff)
    scheduleLoad(1500).catch(() => {})
  }, [])

  return (
    <div data-testid="dashboard-content">
      <h1>Dashboard</h1>
      <p>{staff ? `${staff.length} staff` : 'loading...'}</p>
    </div>
  )
}
