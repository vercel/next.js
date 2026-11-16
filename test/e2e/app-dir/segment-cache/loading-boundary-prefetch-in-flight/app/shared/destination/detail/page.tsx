import type { Metadata } from 'next'
import { connection } from 'next/server'

export const metadata: Metadata = {
  title: 'Detail title',
}

// /shared/destination/loading.tsx is the nearest loading boundary.
export default async function Page() {
  await connection()
  return <p id="detail">Detail content</p>
}
