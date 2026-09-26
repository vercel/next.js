'use client'

import { remoteView } from './remote-view'

export function ConsumerProbe() {
  return <pre id="consumer-probe">{JSON.stringify(remoteView)}</pre>
}
