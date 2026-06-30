'use client'

import { useEffect } from 'react'
import { getCompanyStaff, scheduleLoad } from '../../../actions'
import { useCompany } from '../../../providers'

// Mirrors StaffScheduleManager's LoadingSkeleton guard: render skeleton until the
// CompanyProvider client data is present, then the real content.
export function ScheduleManager({ staffId }: { staffId: string }) {
  const { company, staff, services } = useCompany()

  // Mirror the real post-navigation server-action storm: StaffScheduleManager preloads
  // adjacent weeks on mount, and the (auto-opening) shift modal runs a debounced overlap
  // validation ~500ms later. These server-action RPCs fire right after the soft-nav
  // lands, while prefetches of the nav menu (incl. /staff) are also in flight.
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
    return <div data-testid="schedule-skeleton">loading schedule…</div>
  }

  return (
    <div data-testid="schedule-content">
      <h1>Расписание</h1>
      <p>Schedule for staff {staffId}</p>
      <button data-testid="add-shift-button">Добавить смену</button>
    </div>
  )
}
