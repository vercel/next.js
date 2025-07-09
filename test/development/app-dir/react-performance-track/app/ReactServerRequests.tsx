'use client'

import { useSyncExternalStore } from 'react'

const reactServerRequestsServerSnapshot: never[] = []
const ServerRequestsStore = {
  subscribe:
    typeof window === 'undefined'
      ? () => () => {}
      : window.reactServerRequests.subscribe,
  getSnapshot:
    typeof window === 'undefined'
      ? () => []
      : window.reactServerRequests.getSnapshot,
  getServerSnapshot: () => reactServerRequestsServerSnapshot,
}

export function ReactServerRequests() {
  const reactServerRequests = useSyncExternalStore(
    ServerRequestsStore.subscribe,
    ServerRequestsStore.getSnapshot,
    ServerRequestsStore.getServerSnapshot
  )

  return (
    <>
      <p>{reactServerRequests.length} Server Request entries</p>
      <ol>
        {reactServerRequests.map((request, index) => (
          <li key={index}>
            <details>
              <summary>
                <strong>{request.name}</strong>
              </summary>
              <pre>{JSON.stringify(request.properties, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ol>
    </>
  )
}
