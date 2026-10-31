import { useState } from 'react'
export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <>
      <p id="upgrade-marker">before edit</p>
      <button id="upgrade-count" onClick={() => setCount(count + 1)}>
        {count}
      </button>
    </>
  )
}
