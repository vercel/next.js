'use client'

import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    console.log('browser-to-terminal-test-message')
  }, [])

  return <p>Hello World</p>
}
