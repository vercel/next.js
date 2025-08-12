'use client'

import { useState } from 'react'
import { increment } from '../../actions'

export default function Page() {
  const [count, setCount] = useState(0)
  async function updateCount() {
    const newCount = await increment(count)
    setCount(newCount)
  }

  return (
    <form action={updateCount}>
      <div id="count">{count}</div>
      <button>Submit</button>
    </form>
  )
}
