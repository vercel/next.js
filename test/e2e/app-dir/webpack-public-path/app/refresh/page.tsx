import { Suspense } from 'react'
import { connection } from 'next/server'
import Client from './client'

async function Content() {
  await connection()
  return <Client value={crypto.randomUUID()} />
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content />
    </Suspense>
  )
}
