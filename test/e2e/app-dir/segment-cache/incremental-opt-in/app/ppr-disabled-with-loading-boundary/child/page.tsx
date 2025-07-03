import { connection } from 'next/server'

export default async function PPRDisabledWithLoadingBoundaryChildPage() {
  await connection()
  return <div id="child-page-content">Child page content</div>
}
