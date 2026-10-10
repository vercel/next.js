import Link from 'next/link'
import { ClientComponent } from '../_client'
import { connection } from 'next/server'
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
    <Link href="/about" legacyBehavior passHref>
      <ClientComponent>
        <RSC />
      </ClientComponent>
    </Link>
  )
}

function RSC() {
  return <span>About</span>
}
