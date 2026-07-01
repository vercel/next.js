'use client'

import dynamic from 'next/dynamic'

// Mirrors the real StaffTableWrapper: dynamic import with ssr:false, so the table
// chunk only loads on the client after hydration.
const StaffTable = dynamic(
  () => import('./StaffTable').then((mod) => ({ default: mod.StaffTable })),
  {
    ssr: false,
    loading: () => <div data-testid="table-loading">loading table…</div>,
  }
)

export function StaffTableWrapper() {
  return <StaffTable />
}
