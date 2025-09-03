'use client'

import { connection } from 'next/server'

export default async function Page() {
  await connection()
  if (typeof window === 'undefined') {
    throw new Error('client-page-node-error')
  }
  return <div>client-page</div>
}
