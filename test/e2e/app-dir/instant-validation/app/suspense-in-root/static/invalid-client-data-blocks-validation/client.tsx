'use client'

import { use } from 'react'
import { useDataCache } from '../../../../client-data-fetching-lib/client'

export function FetchesClientData({ children }) {
  const dataCache = useDataCache()
  const promise = dataCache.getOrLoad('my-key', async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    return 'My client data result'
  })
  const data = use(promise)
  return (
    <>
      <div>Got client data: "{data}"</div>
      <hr />
      {children}
    </>
  )
}
