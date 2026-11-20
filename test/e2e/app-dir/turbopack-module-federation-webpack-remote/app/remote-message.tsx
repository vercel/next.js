'use client'

import { useEffect, useState } from 'react'

export function RemoteMessage() {
  const [message, setMessage] = useState('loading')

  useEffect(() => {
    // @ts-expect-error -- provided by Module Federation at runtime
    import('catalog/message').then((module) => setMessage(module.message))
  }, [])

  return <p id="remote-message">{message}</p>
}
