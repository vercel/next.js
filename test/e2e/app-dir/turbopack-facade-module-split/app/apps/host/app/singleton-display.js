'use client'

import { useEffect, useState } from 'react'
import { singleton } from 'demo-pkg'

// Reads the singleton instance the host build resolved. Values are only read
// after mount so SSR and first client render agree.
export function SingletonDisplay() {
  const [state, setState] = useState(null)
  useEffect(() => {
    setState({
      instanceId: singleton.instanceId,
      marker: singleton.marker,
    })
  }, [])
  return (
    <div>
      <span id="host-instance">{state ? state.instanceId : 'pending'}</span>
      <span id="host-marker">{state ? state.marker : 'pending'}</span>
    </div>
  )
}
