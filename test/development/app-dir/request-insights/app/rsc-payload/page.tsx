import { RowsTable } from './rows-table'

export default function Page() {
  const rows = Array.from({ length: 500 }, (_, index) => ({
    id: index,
    name: `user-${index}`,
    email: `user${index}@example.com`,
  }))
  return <RowsTable rows={rows} />
}
