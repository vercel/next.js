'use client'

import Link from 'next/link'
import { memo } from 'react'
import { Staff } from '../actions'

// react-table REMOVED: plain table, same testids.
function DataTableInner({ data }: { data: Staff[] }) {
  return (
    <table data-testid="staff-table">
      <tbody>
        {data.map((s) => (
          <tr key={s.id} data-testid={`staff-row-${s.id}`}>
            <td>{s.name}</td>
            <td>
              <Link
                href={`/staff/${s.id}/schedule`}
                data-testid="staff-schedule"
                data-staff-id={s.id}
              >
                schedule
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const DataTable = memo(DataTableInner)
