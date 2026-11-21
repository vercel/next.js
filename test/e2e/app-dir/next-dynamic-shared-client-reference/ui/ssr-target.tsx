'use client'

import { useEffect, useState } from 'react'

export default function SsrTarget() {
  const [result, setResult] = useState('loading')
  useEffect(() => {
    import('./lib').then(({ search }) => setResult(search('apple')))
  }, [])
  return <p className="ssr-target">ssr target: {result}</p>
}
