'use client'

import { Profiler, useReducer } from 'react'

if (typeof window !== 'undefined') {
  ;(window as any).staticChildRenders = 0
}

function StaticChild() {
  return (
    <Profiler
      onRender={(id, phase) => {
        ;(window as any).staticChildRenders += 1
      }}
      id="test"
    >
      <div>static child</div>
    </Profiler>
  )
}

export default function Page() {
  const [count, increment] = useReducer((n) => n + 1, 1)
  return (
    <>
      <div data-testid="parent-commits">Parent commits: {count}</div>
      <button onClick={increment}>Increment</button>
      <StaticChild />
    </>
  )
}
