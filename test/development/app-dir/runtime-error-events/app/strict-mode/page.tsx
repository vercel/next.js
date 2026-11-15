'use client'

import { useEffect } from 'react'

export default function Page() {
  if (typeof window !== 'undefined') {
    console.error(new Error('strict render failed'))
  }
  useEffect(() => {
    // This report includes all captures from the preceding Strict Mode renders.
    console.error(new Error('strict render complete'))
  }, [])
  return <p>Strict Mode</p>
}
