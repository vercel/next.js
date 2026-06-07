import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

const delayMs = 0
const marker = 'initial'

async function getCachedMarker() {
  'use cache'

  console.log(`[hmr-rsc-cancellation] cache fill started: ${marker}`)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  console.log(`[hmr-rsc-cancellation] cache fill finished: ${marker}`)
  return marker
}

async function DynamicContent() {
  await connection()
  console.log(`[hmr-rsc-cancellation] render started: ${marker}`)
  const cachedMarker = await getCachedMarker()

  return <p id="marker">{cachedMarker}</p>
}

async function redirectToTarget() {
  'use server'
  redirect('/redirect-target')
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p id="marker">loading</p>}>
        <DynamicContent />
      </Suspense>
      <form action={redirectToTarget}>
        <button id="redirect-to-target">redirect</button>
      </form>
    </>
  )
}
