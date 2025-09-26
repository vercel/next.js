'use client'

import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    throw new Error('error in page')
  }, [])
  return <p>index page</p>
}
