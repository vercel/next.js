'use client'

import React from 'react'
import Link from 'next/link'

export default function Page() {
  const setShallowSearchParams = React.useCallback(() => {
    // Maintain history state, but set a shallow search param
    history.replaceState(history.state, '', '?foo=bar')
  }, [])
  return (
    <>
      <button onClick={setShallowSearchParams}>Click me first</button>
      <Link href="/search-params/shallow/other" prefetch>
        Then hover me
      </Link>
    </>
  )
}
