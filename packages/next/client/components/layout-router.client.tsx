import React, { useEffect, useContext, useCallback } from 'react'
import {
  AppTreeContext,
  AppTreeUpdateContext,
  AppRouterCacheContext,
} from '../../shared/lib/app-router-context'

function ReadRootComponent({ children }: any) {
  // let root = readRoot()

  return children
}
export default function LayoutRouter({ path, children, loading }: any) {
  const { segmentPath, tree } = useContext(AppTreeContext)
  const currentSegmentPath =
    (segmentPath === '' || segmentPath === '/' ? '/' : segmentPath + '/') + path

  const treePatchParent = useContext(AppTreeUpdateContext)

  const treePatch = useCallback(
    (updatePayload: any) => {
      treePatchParent({
        ...tree,
        children: updatePayload,
      })
    },
    [tree, treePatchParent]
  )

  useEffect(() => {
    if (!tree) {
      treePatchParent({
        path,
        children: tree.children,
      })
    }
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
  const renderChildrenWithLoading = loading ? (
    <React.Suspense fallback={loading}>
      <ReadRootComponent>{renderChildren}</ReadRootComponent>
    </React.Suspense>
  ) : (
    renderChildren
  )

  return (
    <>
      {tree ? (
        <AppTreeUpdateContext.Provider value={treePatch}>
          <AppTreeContext.Provider
            value={{
              segmentPath: currentSegmentPath,
              tree: tree.children,
            }}
          >
            {renderChildrenWithLoading}
          </AppTreeContext.Provider>
        </AppTreeUpdateContext.Provider>
      ) : (
        renderChildrenWithLoading
      )}
    </>
  )
}
