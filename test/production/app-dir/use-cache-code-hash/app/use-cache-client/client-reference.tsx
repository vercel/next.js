'use client'

import { useEffect } from 'react'
import { data } from './data'

export function ClientComponent() {
  useEffect(() => {
    new SharedWorker(new URL('./worker', import.meta.url))
  }, [])

  return <p>This client {data()}</p>
}
