import Link from 'next/link'
import { connection } from 'next/server'

export const dynamic = 'force-dynamic'

export default async function StalledPage() {
  await connection()
  return (
    <main>
      <h1 id="stalled-page-heading">Stalled page</h1>
      <Link href="/">Home</Link>
    </main>
  )
}
