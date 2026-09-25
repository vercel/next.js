'use client'

import { use } from 'react'
import { io } from 'next/cache'

export function ClientIO() {
  use(io())
  return <p id="client-io">Client-only IO</p>
}
