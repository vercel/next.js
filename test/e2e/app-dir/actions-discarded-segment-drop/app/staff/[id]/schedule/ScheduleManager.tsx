'use client'

import { useEffect } from 'react'
import { getCompanyStaff, scheduleLoad } from '../../../actions'
import { useCompany } from '../../../providers'

// Renders a skeleton until the CompanyProvider context is populated, then the real
// content. A dropped navigation leaves this stuck on the skeleton (or bounced back
// to /staff).
export function ScheduleManager({ staffId }: { staffId: string }) {
  const { company, staff, services } = useCompany()

  // Post-navigation server-action churn, firing right after the soft-nav lands.
  useEffect(() => {
    scheduleLoad(50).catch(() => {})
    scheduleLoad(50).catch(() => {})
    getCompanyStaff().catch(() => {})
    const t = setTimeout(() => {
      getCompanyStaff().catch(() => {})
    }, 500)
    return () => clearTimeout(t)
  }, [staffId])

  if (!company || !staff || services.length === 0) {
    return <div data-testid="schedule-skeleton">loading schedule...</div>
  }

  return (
    <div data-testid="schedule-content">
      <h1>Schedule</h1>
      <p>Schedule for staff {staffId}</p>
    </div>
  )
}
