import { draftMode } from 'next/headers'

function Component() {
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
