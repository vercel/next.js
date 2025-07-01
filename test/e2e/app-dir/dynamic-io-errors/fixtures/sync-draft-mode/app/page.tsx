import { draftMode, UnsafeUnwrappedDraftMode } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses draftMode.isEnabled synchronously. This does not
        trigger dynamic, and the build should succeed. In dev mode, we do log an
        error for the sync access though.
      </p>
      <DraftModeReadingComponent />
    </>
  )
}

async function DraftModeReadingComponent() {
  await new Promise((r) => process.nextTick(r))
  const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
    .isEnabled
  return (
    <div>
      this component read the draftMode isEnabled status synchronously:{' '}
      <span id="draft-mode">{String(isEnabled)}</span>
    </div>
  )
}
