'use client'

import { use } from 'react'

export function Client({ io }: { io: Promise<string> }) {
  const data = use(io)
  return <div>Data: {data}</div>
}
