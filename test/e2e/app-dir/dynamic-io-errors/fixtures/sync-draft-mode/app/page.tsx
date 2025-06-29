import { Suspense } from 'react'
import { draftMode, UnsafeUnwrappedDraftMode } from 'next/headers'

import { IndirectionOne } from './indirection'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses draftMode.isEnabled synchronously. This does not
        trigger dynamic, and the build should succeed. In dev mode, we do log an
        error for the sync access though.
      </p>
      <Suspense fallback={<Fallback />}>
        <IndirectionOne>
          <DraftModeReadingComponent />
        </IndirectionOne>
      </Suspense>
    </>
  )
}

async function DraftModeReadingComponent() {
  await new Promise((r) => process.nextTick(r))
  const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
    .isEnabled

  console.log(
    'This log should be prefixed with the "Prerender" environment, because the sync access above does not lead to an abort.'
  )

  return (
    <div>
      this component read the draftMode isEnabled status synchronously:{' '}
      <span id="draft-mode">{isEnabled.toString()}</span>
    </div>
  )
}

function Fallback() {
  return <div data-fallback="">loading...</div>
}
