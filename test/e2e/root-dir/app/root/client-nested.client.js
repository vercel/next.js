import { useState, useEffect } from 'react'

export default function ClientNestedLayout({ children }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(1)
  }, [count])
  return (
    <>
      <h1>Client Nested. Count: {count}</h1>
      {children}
    </>
  )
}
