'use client'

import { createInstance } from '@module-federation/runtime-tools'
import { useEffect, useRef, useState } from 'react'

export default function Page() {
  const [message, setMessage] = useState('loading')
  const hostRef = useRef(null)

  useEffect(() => {
    const shareScope = new URLSearchParams(location.search).has('array')
      ? ['catalog', 'other']
      : 'catalog'
    const host = (hostRef.current ||= createInstance({
      name: 'enhancedHost',
      remotes: [
        {
          name: 'nextRemote',
          entry: process.env.NEXT_PUBLIC_MF_REMOTE_URL,
          entryGlobalName: 'nextRemote',
          type: 'global',
          shareScope,
        },
      ],
      plugins: [
        {
          name: 'observe-container-options',
          beforeInitContainer(options) {
            globalThis.federationInitOptions = options.remoteEntryInitOptions
            return options
          },
        },
      ],
    }))
    globalThis.enhancedHost = host
    host
      .loadRemote('nextRemote/message')
      .then((module) => setMessage(module.message))
      .catch((error) => setMessage(error.message))
  }, [])

  return <p id="enhanced-message">{message}</p>
}
