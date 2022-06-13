import { useState, useEffect } from 'react'

export default function ClientComponentRoute() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(1)
  }, [count])
  return (
    <>
      <p>hello from app/client-component-route. count: {count}</p>
    </>
  )
}
