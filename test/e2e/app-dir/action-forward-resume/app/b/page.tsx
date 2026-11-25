import { Suspense } from 'react'
import { connection } from 'next/server'
import { ActionButton } from './action-button'

export const maxDuration = 30

async function Dynamic() {
  await connection()
  return <p id="dynamic">ready</p>
}

export default function Page() {
  return (
    <main>
      <ActionButton />
      <Suspense fallback={<p>Loading...</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
