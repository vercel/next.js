import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

const delayMs = 0
const marker = 'initial'

async function DynamicContent() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, delayMs))

  return <p id="marker">{marker}</p>
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
