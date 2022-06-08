import React, { useEffect } from 'react'
import {
  AppRouterContext,
  AppTreeContext,
  AppTreeUpdateContext,
} from '../../shared/lib/app-router-context'
import { fetchServerResponse } from './app-router.client.js'
import useRouter from './userouter.js'

// TODO:
// What is the next segment for this router?
// What is the parallel router (for lookup in history state)?
// If you have children or another prop name for parallel router does not exist because it has not seen before
// Use the props as the initial value to fill in the history state, this would cause a replaceState to update the tree
// Should probably be batched (wrapper around history)
export default function LayoutRouter({ path, children }: any) {
  // const [appRouter, previousUrlRef, current] = useRouter(initialUrl)
  const { segmentPath, tree } = React.useContext(AppTreeContext)
  const currentSegmentPath =
    (segmentPath === '' || segmentPath === '/' ? '/' : segmentPath + '/') + path

  const treePatchParent = React.useContext(AppTreeUpdateContext)

  const treePatch = React.useCallback(
    (updatePayload: any) => {
      treePatchParent({
        ...tree,
        children: updatePayload,
      })
    },
    [tree, treePatchParent]
  )

  useEffect(() => {
    treePatchParent({
      path,
    })
  }, [path])

  let root
  // if (current.url !== previousUrlRef.current?.url) {
  //   // eslint-disable-next-line
  //   const data = fetchServerResponse(current.url, layoutPath)
  //   root = data.readRoot()
  //   // TODO: handle case where middleware rewrites to another page
  // }

  // `tree` only exists in the browser hence why this is conditional
  const renderChildren = root ? root : children

  return (
    // <AppRouterContext.Provider value={appRouter}>
    <>
      {tree ? (
        <AppTreeUpdateContext.Provider value={treePatch}>
          <AppTreeContext.Provider
            value={{
              segmentPath: currentSegmentPath,
              tree: tree.children,
            }}
          >
            {renderChildren}
          </AppTreeContext.Provider>
        </AppTreeUpdateContext.Provider>
      ) : (
        renderChildren
      )}
    </>
    // </AppRouterContext.Provider>
  )
}
