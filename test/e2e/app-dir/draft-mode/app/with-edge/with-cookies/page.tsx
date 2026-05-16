import React from 'react'
import { cookies, draftMode } from 'next/headers'

export default async function Page() {
  const { isEnabled } = await draftMode()
  let data: string | undefined
  if (isEnabled) {
    data = (await cookies()).get('data')?.value
  }

  return (
    <>
      <h1>Draft Mode with dynamic cookie</h1>
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
