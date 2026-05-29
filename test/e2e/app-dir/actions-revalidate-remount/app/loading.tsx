'use client'

import { useEffect } from 'react'

export default function Loading() {
  useEffect(() => {
    console.log('Root Loading Mounted')
  }, [])

  return <p>Root Page Loading</p>
}
