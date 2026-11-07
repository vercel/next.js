'use client'

import { useEffect, useState } from 'react'

export function RemoteMessage() {
  const [message, setMessage] = useState('loading')
  const [workerMessage, setWorkerMessage] = useState('loading')
  const [scriptCount, setScriptCount] = useState('loading')

  useEffect(() => {
    // Insert the remote entry first. Federation should attach to this in-flight script rather
    // than adding a duplicate tag.
    if (
      !document.querySelector('script[src="/webpack-remote/remoteEntry.js"]')
    ) {
      const script = document.createElement('script')
      script.src = '/webpack-remote/remoteEntry.js'
      document.head.appendChild(script)
    }
    // @ts-expect-error -- provided by Module Federation at runtime
    import('catalog/message').then((module) => {
      setMessage(module.message ?? `missing export: ${JSON.stringify(module)}`)
      setScriptCount(
        String(
          document.querySelectorAll(
            'script[src="/webpack-remote/remoteEntry.js"]'
          ).length
        )
      )
    })

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
      <p id="worker-message">{workerMessage}</p>
      <p id="remote-script-count">{scriptCount}</p>
    </>
  )
}
