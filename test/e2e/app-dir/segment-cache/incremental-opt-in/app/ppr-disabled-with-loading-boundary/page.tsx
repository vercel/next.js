import { connection } from 'next/server'

export default async function PPRDisabledWithLoadingBoundary() {
  await connection()
  return <div id="page-content">Page content</div>
}
