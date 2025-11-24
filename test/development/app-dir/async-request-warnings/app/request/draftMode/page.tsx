import { draftMode } from 'next/headers'

function Component() {
  // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
  const isEnabled = (draftMode() as any).isEnabled
  ;(draftMode() as any).enable()

  const clonedDraftMode = {
    ...(draftMode() as any),
  }
  return <pre>{JSON.stringify({ clonedDraftMode, isEnabled }, null, 2)}</pre>
}

export default function Page() {
  const isEnabled = (draftMode() as any).isEnabled
  return (
    <>
      <pre>{JSON.stringify({ isEnabled }, null, 2)}</pre>
      <Component />
      <Component />
    </>
  )
}
