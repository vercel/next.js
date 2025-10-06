'use client'

import { connection } from 'next/server'
import nextDynamic from 'next/dynamic'

const Component = nextDynamic(() => import('./component'))

export default async function Page() {
  await connection()
  return <Component />
}
