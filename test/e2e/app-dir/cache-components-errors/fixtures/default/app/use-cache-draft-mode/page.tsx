import { draftMode } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page enables draft mode in `'use cache'`, which triggers an error.
      </p>
      <DraftModeEnablingComponent />
    </>
  )
}

async function DraftModeEnablingComponent() {
  'use cache'

  // Enabling draft mode in a cache context is not allowed. We're try/catching
  // here to ensure that this error is shown even when it's caught in userland.
  try {
    ;(await draftMode()).enable()
  } catch {}

  return null
}
