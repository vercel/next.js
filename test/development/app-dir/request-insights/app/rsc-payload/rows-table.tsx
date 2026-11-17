'use client'

export function RowsTable({ rows }: { rows: Array<{ id: number }> }) {
  return <p id="rows-table">rows: {rows.length}</p>
}
