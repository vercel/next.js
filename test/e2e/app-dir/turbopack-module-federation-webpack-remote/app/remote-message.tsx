'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const RemoteComponent = dynamic(
  // @ts-expect-error -- provided by Module Federation at runtime
  () => import('catalog/component'),
  { ssr: false, loading: () => <p>loading remote component</p> }
)

export function RemoteMessage() {
  const [message, setMessage] = useState('loading')
  const [workerMessage, setWorkerMessage] = useState('loading')
  const [scriptCount, setScriptCount] = useState('loading')
  const [fallbackMessage, setFallbackMessage] = useState('loading')
  const [asyncMessage, setAsyncMessage] = useState('loading')

  useEffect(() => {
    const remoteEntry = `${process.env.NEXT_PUBLIC_MF_REMOTE_ORIGIN}/browser/remoteEntry.js`
    // Insert the remote entry first. Federation should attach to this in-flight script rather
    // than adding a duplicate tag.
    if (
      !Array.from(document.scripts).some((script) => script.src === remoteEntry)
    ) {
      const script = document.createElement('script')
      script.src = remoteEntry
      document.head.appendChild(script)
    }
    // @ts-expect-error -- provided by Module Federation at runtime
    import('catalog/message').then((module) => {
      setMessage(module.message ?? `missing export: ${JSON.stringify(module)}`)
      setScriptCount(
        String(
          Array.from(document.scripts).filter(
            (script) => script.src === remoteEntry
          ).length
        )
      )
    })
    // @ts-expect-error -- provided by Module Federation at runtime
    import('fallbackCatalog/message').then((module) => {
      setFallbackMessage(module.message)
    })
    if (process.env.NEXT_PUBLIC_MF_IMPLEMENTATION) {
      // @ts-expect-error -- provided by Module Federation at runtime
      import('fallbackCatalog/async').then((module) => {
        setAsyncMessage(module.message)
      })
    }

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
      <RemoteComponent />
      <p id="worker-message">{workerMessage}</p>
      <p id="remote-script-count">{scriptCount}</p>
      <p id="fallback-message">{fallbackMessage}</p>
      <p id="async-message">{asyncMessage}</p>
    </>
  )
}
