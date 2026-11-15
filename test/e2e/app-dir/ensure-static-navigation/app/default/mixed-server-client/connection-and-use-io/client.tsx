'use client'
import { io } from 'next/cache'
import { use } from 'react'

export function ClientIO() {
  use(io())
  return <p>{`Client dynamic data`}</p>
}
