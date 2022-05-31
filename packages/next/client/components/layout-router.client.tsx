import React from 'react'
import { AppRouterContext } from '../../shared/lib/app-router-context'
import { fetchServerResponse } from './app-router.client.js'
import useRouter from './userouter.js'

export default function LayoutRouter({
  initialUrl,
  layoutPath,
  children,
}: any) {
  const [appRouter, previousUrlRef, current] = useRouter(initialUrl)
  let root
  if (current.url !== previousUrlRef.current?.url) {
    // eslint-disable-next-line
    const data = fetchServerResponse(current.url, layoutPath)
    root = data.readRoot()
  }
  return (
    <AppRouterContext.Provider value={appRouter}>
      {root ? root : children}
    </AppRouterContext.Provider>
  )
}
