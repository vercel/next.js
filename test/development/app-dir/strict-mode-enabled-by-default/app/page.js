'use client'
import { useEffect, useState } from 'react'

let i = 0
export default function Page() {
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    i++
    forceUpdate()
  }, [])
  return <p>{i}</p>
}
