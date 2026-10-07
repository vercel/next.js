import type { Metadata } from 'next'
import { connection } from 'next/server'

export const metadata: Metadata = {
  title: 'Detail page',
}

// No loading.tsx of its own; /shared/destination/loading.tsx is its boundary.
export default async function Page() {
  await connection()
  return <p id="detail">Detail page</p>
}
