import { cookies } from 'next/headers'
import { setTimeout } from 'node:timers/promises'
import { Suspense } from 'react'

async function getCachedValue() {
  'use cache'
  await setTimeout(1500)
  return new Date().toISOString()
}

async function SessionData() {
  await cookies()
  await getCachedValue()
  return <p id="cookies">Yum yum, delicious</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p id="cookies">Loading...</p>}>
      <SessionData />
    </Suspense>
  )
}
