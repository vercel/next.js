import { useState, useEffect } from 'react'

export default function Page() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(1)
  }, [])

  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
