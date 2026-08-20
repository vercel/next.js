'use client'

import { useEffect, useState } from 'react'

export function RemoteMessage() {
  const [message, setMessage] = useState('loading')
  const [shared, setShared] = useState('loading')
  const [remoteShared, setRemoteShared] = useState('loading')
  const [strictError, setStrictError] = useState('loading')
  const [fallback, setFallback] = useState('loading')

  useEffect(() => {
    async function load() {
      // @ts-expect-error -- configured with a local fallback at runtime
      const fallbackModule = await import('local-fallback')
      setFallback(fallbackModule.value)
      // @ts-expect-error -- provided by Module Federation at runtime
      const remote = await import('catalog/message')
      setMessage(remote.message)
      setRemoteShared(remote.remoteShared)
      // @ts-expect-error -- provided by the remote share scope at runtime
      const sharedModule = await import('remote-shared')
      setShared(sharedModule.value)
      try {
        // @ts-expect-error -- configured to exercise a strict version mismatch
        await import('strict-remote-shared')
      } catch (error) {
        setStrictError((error as Error).message)
      }
    }
    load()
  }, [])

  return (
    <>
      <p id="remote-message">{message}</p>
      <p id="shared-message">{shared}</p>
      <p id="remote-shared-message">{remoteShared}</p>
      <p id="strict-error">{strictError}</p>
      <p id="fallback-message">{fallback}</p>
    </>
  )
}
