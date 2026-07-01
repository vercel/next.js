'use client'

import { useEffect, useState } from 'react'
import { getCompanyStaff, scheduleLoad, Staff } from '../actions'
import { DataTable } from './DataTable'

export function StaffTable() {
  const [staff, setStaff] = useState<Staff[] | null>(null)

  useEffect(() => {
    getCompanyStaff().then(setStaff)
    scheduleLoad(1500).catch(() => {})
  }, [])

  if (!staff) {
    return <div data-testid="query-loading">loading rows…</div>
  }

  return <DataTable data={staff} />
}
