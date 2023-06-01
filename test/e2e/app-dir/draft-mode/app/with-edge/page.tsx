import React from 'react'
import { cookies, draftMode } from 'next/headers'

export const runtime = 'experimental-edge'

export default function Page() {
  const { isEnabled } = draftMode()
  let data: string | undefined
  if (isEnabled) {
    const c = cookies()
    data = c.get('data')?.value
  }

  return (
    <>
      <h1>Draft Mode in Edge</h1>
      <p>
        Random: <em id="rand">{Math.random()}</em>
      </p>
      <p>
        State: <strong id="mode">{isEnabled ? 'ENABLED' : 'DISABLED'}</strong>
      </p>
      <p>
        Data: <em id="data">{data}</em>
      </p>
    </>
  )
}
