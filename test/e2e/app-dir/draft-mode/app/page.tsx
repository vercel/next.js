import React from 'react'
import { draftMode } from 'next/headers'

export default async function Page() {
  const { isEnabled } = await draftMode()

  return (
    <>
      <h1>Draft Mode Test</h1>
      <p>
        Random: <em id="rand">{Math.random()}</em>
      </p>
      <p>
        State: <strong id="mode">{isEnabled ? 'ENABLED' : 'DISABLED'}</strong>
      </p>
    </>
  )
}
