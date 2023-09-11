import { useEffect } from 'react'

/**
 * Faile because client side hooks can not be used in server component
 */

const Test3 = () => {
  useEffect(() => {
    console.log("Its okay here. But you need to add 'use client' on top line.")
  }, [])

  return <h1>Client Test 3</h1>
}

export default Test3
