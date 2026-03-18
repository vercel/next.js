'use client'

import { useEffect } from 'react'

export default function Page() {
  // set a timeout to throw an error each 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      throw new Error('This is a test error from the app directory')
    }, 500)

    return () => clearInterval(interval)
  }, [])
  return <p>page</p>
}
