import * as React from 'react'
import { cookies } from 'next/headers'

if (!('hot' in Math)) Math.hot = false

export default function page() {
  // make the page dynamic
  cookies()
  const previous = Math.hot
  Math.hot = true

  // crash the server after responding
  if (process.env.CRASH_FUNCTION) {
    setTimeout(() => {
      throw new Error('crash')
    }, 500)
  }

  return <div>{previous ? 'HOT' : 'COLD'}</div>
}
