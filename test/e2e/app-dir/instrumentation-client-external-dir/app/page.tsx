'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [result, setResult] = useState<string>('')

  useEffect(() => {
    setResult((window as any).__INSTRUMENTATION_CLIENT_RESULT || 'not-set')
  }, [])

  return <p id="result">{result}</p>
}
