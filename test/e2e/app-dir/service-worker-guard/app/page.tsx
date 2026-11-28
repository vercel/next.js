'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [result, setResult] = useState('pending')

  useEffect(() => {
    if (!navigator.serviceWorker) {
      setResult('unsupported')
      return
    }
    setResult('supported')
  }, [])

  return <p id="result">{result}</p>
}
