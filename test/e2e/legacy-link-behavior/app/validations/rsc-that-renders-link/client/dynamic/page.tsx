import Link from 'next/link'
import { ClientComponent } from '../_client'
import { Suspense } from 'react'
import { connection } from 'next/server'

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
    <Link href="/about" legacyBehavior passHref>
      <ClientComponent>About</ClientComponent>
    </Link>
  )
}
