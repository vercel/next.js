'use client'

import { useEffect } from 'react'

export default function Page() {
  let $_: any
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-eval
    $_ = eval('$')
  }

  useEffect(() => {
    if (Array.isArray($_)) {
      document.getElementById('react-compiler-enabled-message')!.textContent =
        `React compiler is enabled with ${$_!.length} memo slots`
    }
  })

  return (
    <>
      <div>
        <h1 id="react-compiler-enabled-message" />
        <p>hello world</p>
      </div>
    </>
  )
}
