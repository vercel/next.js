'use client'

import { useState, useEffect } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    // When this component is hydrated, there might be other parts still pending
    // on streaming. So we test the interactivity of the document before it's
    // fully loaded.
    const counter = document.querySelector('button')
    const suspense = document.querySelector('.suspense')
    counter.click()
    setTimeout(() => {
      window.partial_hydration_suspense_result = suspense.textContent
      window.partial_hydration_counter_result = counter.textContent
    }, 0)
  }, [])

  return <button onClick={() => setCount(count + 1)}>count: {count}</button>
}
