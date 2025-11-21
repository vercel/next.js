'use client'

import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    throw new Error('error in useEffect')
  }, [])

  return <p>Hello world!</p>
}
