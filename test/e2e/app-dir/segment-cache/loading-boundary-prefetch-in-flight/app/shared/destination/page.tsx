import type { Metadata } from 'next'
import { connection } from 'next/server'

export const metadata: Metadata = {
  title: 'Destination title',
}

export default async function Page() {
  await connection()
  return <p id="destination">Destination content</p>
}
