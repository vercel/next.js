import { useState, useEffect } from 'react'

export default function RegeneratorTest() {
  const [message, setMessage] = useState('')
  useEffect(() => {
    ;(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      setMessage('Hello World')
    })()
  }, [])
  return <h1>{message}</h1>
}
