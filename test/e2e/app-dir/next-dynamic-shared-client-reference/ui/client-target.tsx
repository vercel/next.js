'use client'

import { useEffect, useState } from 'react'

export default function ClientTarget() {
  const [result, setResult] = useState('loading')
  useEffect(() => {
    import('./lib').then(({ search }) => setResult(search('banana')))
  }, [])
  return <p className="client-target">client target: {result}</p>
}
