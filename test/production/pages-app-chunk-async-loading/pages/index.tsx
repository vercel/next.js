import { useState } from 'react'
import { sharedLabel } from '../shared'

export default function Page() {
  const [count, setCount] = useState(0)
  return (
    <>
      <p id="shared">{sharedLabel('page')}</p>
      <button id="increment" onClick={() => setCount((c) => c + 1)}>
        count: {count}
      </button>
    </>
  )
}
