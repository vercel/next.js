'use client'

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import Link from 'next/link'
import { memo } from 'react'
import { Staff } from '../actions'

const columns: ColumnDef<Staff>[] = [
  {
    id: 'name',
    header: 'Имя',
    cell: ({ row }) => <span>{row.original.name}</span>,
  },
  {
    id: 'schedule',
    header: '',
    cell: ({ row }) => (
      <Link
        href={`/staff/${row.original.id}/schedule`}
        data-testid="staff-schedule"
        data-staff-id={row.original.id}
        aria-label="Расписание"
      >
        📅
      </Link>
    ),
  },
]

// Mirrors the real DataTableRow: memo'd row.
const DataTableRow = memo(
  ({ row, visibleCells }: { row: any; visibleCells: any }) => (
    <tr data-testid={`staff-row-${row.original.id}`}>
      {visibleCells.map((cell: any) => (
        <td key={cell.id} style={{ padding: '4px 8px' }}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  )
)
DataTableRow.displayName = 'DataTableRow'

function DataTableInner({ data }: { data: Staff[] }) {
  // Rows keyed by TanStack default (row index), like the real table.
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <table data-testid="staff-table">
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <DataTableRow
            key={row.id}
            row={row}
            visibleCells={row.getVisibleCells()}
          />
        ))}
      </tbody>
    </table>
  )
}

export const DataTable = memo(DataTableInner)
