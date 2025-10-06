import React from 'react'
import { cookies } from 'next/headers'
import { Delay, Login } from './state'

export async function Dynamic({ fallback }) {
  const dynamic = fallback !== true

  let signedIn
  let active
  if (dynamic) {
    signedIn = (await cookies()).has('session')
    active = (await cookies()).has('delay')
    if (active) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  if (!dynamic) {
    return (
      <div id="dynamic-fallback">
        <pre>Loading...</pre>
        <Login fallback />
        <Delay fallback />
      </div>
    )
  }

  return (
    <div id="dynamic">
      <pre id="state" className={signedIn ? 'bg-green-600' : 'bg-red-600'}>
        {signedIn ? 'Signed In' : 'Not Signed In'}
      </pre>
      <Login signedIn={signedIn} />
      <Delay active={active} />
    </div>
  )
}
