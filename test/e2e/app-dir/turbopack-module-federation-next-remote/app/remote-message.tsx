'use client'

import { useEffect, useState } from 'react'

export function RemoteMessage() {
  const [message, setMessage] = useState('loading')
  const [lazyMessage, setLazyMessage] = useState('loading')

  useEffect(() => {
    // @ts-expect-error -- provided by Module Federation at runtime
    import('nextRemote/message').then(async (module) => {
      setMessage(module.message)
      setLazyMessage(await module.lazyMessage())
    })
  }, [])

  return (
    <>
      <p id="remote-message">{message}</p>
      <p id="remote-lazy-message">{lazyMessage}</p>
    </>
  )
}
