import { connection } from 'next/server'
import { Suspense } from 'react'
import { Client } from './client'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Client data={connection().then(() => 'Server data')} />
    </Suspense>
  )
}
