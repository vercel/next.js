import React from 'react'
import { AppRouterContext } from '../../shared/lib/app-router-context'
import { fetchServerResponse } from './app-router.client.js'
import useRouter from './userouter.js'

// TODO:
// What is the next segment for this router?
// What is the parallel router (for lookup in history state)?
// If you have children or another prop name for parallel router does not exist because it has not seen before
// Use the props as the initial value to fill in the history state, this would cause a replaceState to update the tree
// Should probably be batched (wrapper around history)
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
    // TODO: handle case where middleware rewrites to another page
  }
  return (
    <AppRouterContext.Provider value={appRouter}>
      {root ? root : children}
    </AppRouterContext.Provider>
  )
}
