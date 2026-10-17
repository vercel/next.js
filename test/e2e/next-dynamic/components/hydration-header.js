import { useState } from 'react'

export default function Header() {
  const [count, setCount] = useState(0)

  return (
    <button id="dynamic-header" onClick={() => setCount(count + 1)}>
      Header: {count}
    </button>
  )
}
