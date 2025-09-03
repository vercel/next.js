'use client'

import { connection } from 'next/server'

export default async function Page() {
  await connection()
  if (typeof window === 'undefined') {
    throw new Error('client-page-edge-error')
  }
  return <div>client-page</div>
}

export const runtime = 'edge'
