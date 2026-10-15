import { draftMode } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { RetainedActionControls } from '../retained-actions'

async function Mode() {
  await connection()
  const { isEnabled } = await draftMode()
  return (
    <p id="forwarded-target-mode">
      {isEnabled
        ? 'Forwarded target draft mode: enabled'
        : 'Forwarded target draft mode: disabled'}
    </p>
  )
}

export default function Page() {
  return (
    <>
      <h1>Forwarded target</h1>
      <Suspense fallback={<p>Loading forwarded draft mode...</p>}>
        <Mode />
      </Suspense>
      <RetainedActionControls />
    </>
  )
}
