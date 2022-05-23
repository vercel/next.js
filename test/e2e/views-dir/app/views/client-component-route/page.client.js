import { useState, useEffect } from 'react'
export default function ClientComponentRoute() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    window.hydrated = true
    setCount(1)
  }, [count])
  return (
    <>
      <p>hello from root/client-component-route. count: {count}</p>
    </>
  )
}
