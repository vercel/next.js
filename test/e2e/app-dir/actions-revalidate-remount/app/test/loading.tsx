'use client'

import { useEffect } from 'react'

export default function Loading() {
  useEffect(() => {
    console.log('Loading Mounted')
  }, [])

  return <p>Test Page Loading</p>
}
