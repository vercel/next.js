'use client'
import { useEffect } from 'react'

let i = 1
export default function Page() {
  useEffect(() => {
    console.log(`logged ${i++} times`)
  }, [])
}
