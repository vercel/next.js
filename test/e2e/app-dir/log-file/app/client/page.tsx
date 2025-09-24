'use client'

import { useEffect } from 'react'

export default function ClientPage() {
  useEffect(() => {
    // Logging in client component useEffect
    console.log('Client: This is a log message from client component')
    console.error('Client: This is an error message from client component')
    console.warn('Client: This is a warning message from client component')
  }, [])

  return <p>client page with logging</p>
}
