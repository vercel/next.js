'use client'

import { invokeCallback } from 'interleave'

export default function Page() {
  const throwError = invokeCallback(() => {
    throw new Error('interleaved error')
  }, [])

  throwError()

  return <p>fail</p>
}
