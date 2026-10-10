import { connection } from 'next/server'
import { ClientLink } from '../../client-link'
import ClientA from '../_client'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense>
      <Dynamic />
    </Suspense>
  )
}

async function Dynamic() {
  await connection()
  return (
    <ClientLink href="/about">
      <ClientA>About</ClientA>
    </ClientLink>
  )
}
