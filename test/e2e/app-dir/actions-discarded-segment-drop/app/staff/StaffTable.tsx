'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getCompanyStaff, scheduleLoad } from '../actions'
import { DataTable } from './DataTable'

// Mirrors the real StaffTable: rows come from React Query (refetchOnMount:"always"),
// so they appear late — after hydration + the action resolves.
export function StaffTable() {
  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', 'list'],
    queryFn: getCompanyStaff,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
  })

  // HEARTBEAT (diagnostic, NEXT_PUBLIC_HEARTBEAT=1): re-render the SOURCE route tree
  // (where the clicked <Link> lives) repeatedly for ~1.5s after mount, to test whether
  // re-rendering the originating tree during a pending navigation drops the transition.
  // Trailing SLOW server action, still in-flight when the user clicks a row's schedule
  // link, so it overlaps the pending soft-nav. router.refresh() REMOVED to isolate its
  // contribution to the #86151 segment-drop while keeping loading.tsx + an in-flight action.
  useEffect(() => {
    scheduleLoad(1500).catch(() => {})
  }, [])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_HEARTBEAT !== '1') return
    let n = 0
    const id = setInterval(() => {
      setTick(++n)
      if (n > 60) clearInterval(id)
    }, 25)
    return () => clearInterval(id)
  }, [])

  if (isLoading || !staff) {
    return <div data-testid="query-loading">loading rows…</div>
  }

  return (
    <>
      <span style={{ display: 'none' }} data-tick={tick} />
      <DataTable data={staff} />
    </>
  )
}
