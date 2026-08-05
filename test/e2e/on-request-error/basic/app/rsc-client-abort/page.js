import { after, connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  await connection()
  after(() => console.log('[rsc-client-abort] response closed'))

  return (
    <Suspense fallback="rsc-client-abort-fallback">
      <NeverFinishes />
    </Suspense>
  )
}

async function NeverFinishes() {
  await new Promise(() => {})
}
