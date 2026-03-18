'use client'

import { startTransition, useReducer } from 'react'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function Page() {
  const [counter, increment] = useReducer((n) => n + 1, 0)

  function handleClick() {
    startTransition(async () => {
      await sleep(1000)
      startTransition(() => {
        increment()
      })
    })
  }
  return (
    <>
      <p>Count: {counter}</p>
      <button onClick={handleClick}>Increment</button>
    </>
  )
}
