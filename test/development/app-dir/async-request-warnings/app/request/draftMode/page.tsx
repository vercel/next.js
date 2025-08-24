import { draftMode, type UnsafeUnwrappedDraftMode } from 'next/headers'

function Component() {
  const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
    .isEnabled
  ;(draftMode() as unknown as UnsafeUnwrappedDraftMode).enable()

  const clonedDraftMode = {
    ...(draftMode() as unknown as UnsafeUnwrappedDraftMode),
  }
  return <pre>{JSON.stringify({ clonedDraftMode, isEnabled }, null, 2)}</pre>
}

export default function Page() {
  const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
    .isEnabled
  return (
    <>
      <pre>{JSON.stringify({ isEnabled }, null, 2)}</pre>
      <Component />
      <Component />
    </>
  )
}
