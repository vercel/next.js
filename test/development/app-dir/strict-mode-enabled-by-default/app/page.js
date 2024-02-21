'use client'
import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    console.log(`user:logged`)
  }, [])
  return <p>Page</p>
}
