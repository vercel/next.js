import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'

export default function PagesRouterRemotePage() {
  const [RemoteButton, setRemoteButton] = useState<ComponentType<{
    initialCount: number
  }> | null>(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let active = true

    import('remoteApp/Button').then(
      (remote) => {
        if (!active) return
        setRemoteButton(() => remote.default)
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
      <p id="pages-remote-status">{status}</p>
      {RemoteButton ? <RemoteButton initialCount={5} /> : null}
    </main>
  )
}
