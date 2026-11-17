'use client'

import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    const worker = new Worker(new URL('../modules/w1.js', import.meta.url))
    return () => worker.terminate()
  }, [])
  return <p id="page">hello</p>
}
