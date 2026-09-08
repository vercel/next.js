'use client'

import { useEffect, useState } from 'react'

export function RemoteMessage() {
  const [message, setMessage] = useState('loading')
  const [hostShared, setHostShared] = useState('loading')
  const [shared, setShared] = useState('loading')
  const [remoteShared, setRemoteShared] = useState('loading')
  const [strictError, setStrictError] = useState('loading')
  const [fallback, setFallback] = useState('loading')
  const [defaultShared, setDefaultShared] = useState('loading')
  const [workerMessage, setWorkerMessage] = useState('loading')
  const [scriptCount, setScriptCount] = useState('loading')

  useEffect(() => {
    async function load() {
      // @ts-expect-error -- configured with a local fallback at runtime
      const fallbackModule = await import('local-fallback')
      setFallback(fallbackModule.value)
      setMessage('fallback loaded')
      // @ts-expect-error -- default import resolved from a hoisted package
      const defaultSharedModule = await import('default-shared')
      setDefaultShared(defaultSharedModule.value)
      setMessage('default loaded')

      const remoteEntry = `${process.env.NEXT_PUBLIC_MF_REMOTE_ORIGIN}/browser/remoteEntry.js`
      // Insert the remote entry first. Federation should attach to this in-flight script rather
      // than adding a duplicate tag.
      if (
        !Array.from(document.scripts).some(
          (script) => script.src === remoteEntry
        )
      ) {
        const script = document.createElement('script')
        script.src = remoteEntry
        document.head.appendChild(script)
      }

      // Import shared keys directly before any remote expose. The host has the higher
      // `shared-value`, while the remote has the higher `remote-shared`.
      // @ts-expect-error -- configured as a shared module at runtime
      const hostSharedModule = await import('shared-value')
      setHostShared(hostSharedModule.value)
      // @ts-expect-error -- provided by the remote share scope at runtime
      const sharedModule = await import('remote-shared')
      setShared(sharedModule.value)
      setMessage('remote shared loaded')
      // @ts-expect-error -- provided by Module Federation at runtime
      const remote = await import('catalog/message')
      setMessage(remote.message)
      setRemoteShared(remote.remoteShared)
      setScriptCount(
        String(
          Array.from(document.scripts).filter(
            (script) => script.src === remoteEntry
          ).length
        )
      )
      try {
        // @ts-expect-error -- configured to exercise a strict version mismatch
        await import('strict-remote-shared')
      } catch (error) {
        setStrictError((error as Error).message)
      }
    }
    load().catch((error) => setMessage(`error: ${error.stack ?? error}`))

    const worker = new Worker(
      new URL('./federation-worker.ts', import.meta.url),
      { type: 'classic' }
    )
    worker.onmessage = ({ data }) => {
      setWorkerMessage(data.value ?? `error: ${data.error}`)
    }
    worker.postMessage('load')
    return () => worker.terminate()
  }, [])

  return (
    <>
      <p id="remote-message">{message}</p>
      <p id="host-shared-message">{hostShared}</p>
      <p id="shared-message">{shared}</p>
      <p id="remote-shared-message">{remoteShared}</p>
      <p id="strict-error">{strictError}</p>
      <p id="fallback-message">{fallback}</p>
      <p id="default-shared-message">{defaultShared}</p>
      <p id="worker-message">{workerMessage}</p>
      <p id="remote-script-count">{scriptCount}</p>
    </>
  )
}
