'use client'

import React, { useEffect, useState } from 'react'

interface RemoteButtonProps {
  initialCount: number
}

export default function Page() {
  const [RemoteButton, setRemoteButton] = useState<
    React.ComponentType<RemoteButtonProps> | undefined
  >()
  const [status, setStatus] = useState('loading')
  const [usesHostReact, setUsesHostReact] = useState(false)
  const [rootMarker, setRootMarker] = useState('loading')

  useEffect(() => {
    let active = true

    Promise.all([import('remoteApp/Button'), import('remoteApp')]).then(
      ([remoteButton, remoteRoot]) => {
        if (!active) return
        setRemoteButton(() => remoteButton.default)
        setUsesHostReact(remoteButton.reactInstance === React)
        setRootMarker(remoteRoot.rootMarker)
        setStatus('loaded')
      },
      (error: Error) => {
        if (active) setStatus(`error: ${error.message}`)
      }
    )

    return () => {
      active = false
    }
  }, [])

  return (
    <main>
      <p id="remote-status">{status}</p>
      <p id="shared-react">{usesHostReact ? 'same' : 'different'}</p>
      <p id="root-expose-marker">{rootMarker}</p>
      {RemoteButton ? <RemoteButton initialCount={1} /> : null}
    </main>
  )
}
