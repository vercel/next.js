'use client'
import React, { useContext, useEffect, useState } from 'react'
import { Theme } from './Providers'
export default function Counter({ label = 'fixture' }) {
  const theme = useContext(Theme)
  const [count, setCount] = useState(0)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return (
    <button
      id="count"
      data-theme={theme}
      data-ready={String(ready)}
      onClick={() => setCount(count + 1)}
    >
      {theme}:{label}:{count}
    </button>
  )
}
