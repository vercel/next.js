'use client'

import { useEffect, useState } from 'react'
import { singleton } from 'demo-pkg-rc'

// The remote consumer of the singleton: renders which demo-pkg instance the
// remote's shared-module wiring delivered, and writes through it on click.
export function RemoteSingleton() {
  const [state, setState] = useState(null)
  useEffect(() => {
    setState({
      instanceId: singleton.instanceId,
      marker: singleton.marker,
    })
  }, [])
  return (
    <div>
      <span id="remote-instance">{state ? state.instanceId : 'pending'}</span>
      <span id="remote-marker">{state ? state.marker : 'pending'}</span>
      <button
        id="write-remote-marker"
        onClick={() => {
          singleton.marker = 'updated-by-remote'
          setState({
            instanceId: singleton.instanceId,
            marker: singleton.marker,
          })
        }}
      >
        Write remote marker
      </button>
    </div>
  )
}
