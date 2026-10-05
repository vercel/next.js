'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useActionReference } from '../action-context'
import { ping } from './actions'

export function Client() {
  const { setAction } = useActionReference()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setAction(() => ping)
    setReady(true)
  }, [setAction])

  return ready ? (
    <Link id="go-to-b" href="/b">
      Go to /b
    </Link>
  ) : null
}
