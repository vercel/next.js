import { draftMode } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses draftMode.isEnabled synchronously. This does not
        trigger dynamic, and the build should succeed. In dev mode, we do log an
        error for the sync access though.
      </p>
      <DraftModeReadingComponent />
      <Suspense>
        <Dynamic />
      </Suspense>
    </>
  )
}

async function DraftModeReadingComponent() {
  await new Promise((r) => process.nextTick(r))
  // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
  const isEnabled = (draftMode() as any).isEnabled
  return (
    <div>
      this component read the draftMode isEnabled status synchronously:{' '}
      <span id="draft-mode">{String(isEnabled)}</span>
    </div>
  )
}

// This component ensures that we're creating a partially prerendered page, so
// that we also test that there is no sync draftMode defined during the resume.
async function Dynamic() {
  await connection()

  return null
}
