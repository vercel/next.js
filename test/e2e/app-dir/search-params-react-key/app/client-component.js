'use client'

import { useRouter } from 'next/navigation'
import React, { useId } from 'react'

export default () => {
  const router = useRouter()
  return (
    <>
      <div id="random-number">{useId()}</div>
      <button id="push" onClick={() => router.push('/?foo=bar')}>
        push to /?foo=bar
      </button>
      <button id="replace" onClick={() => router.replace('/?foo=baz')}>
        replace with /?foo=baz
      </button>
    </>
  )
}
