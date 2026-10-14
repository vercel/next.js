'use client'

import { useEffect } from 'react'
import { spawn } from '../lib/spawn'

export default function Page() {
  useEffect(() => {
    const worker = spawn()
    worker.terminate()
  }, [])

  return <p>worker cycle</p>
}
