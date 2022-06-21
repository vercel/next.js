import React, { useContext } from 'react'
import {
  AppTreeContext,
  FullAppTreeContext,
} from '../../shared/lib/app-router-context'
import { fetchServerResponse } from './app-router.client'

let infinitePromise: Promise<void>

export function InnerLayoutRouter({
  url,
  childNodes,
  childProp,
  layoutPath,
  tree,
  // isActive,
  path,
}: any) {
  const { changeByServerResponse, tree: fullTree } =
    useContext(FullAppTreeContext)
  // TODO: What to do during SSR?
  if (!childNodes && childProp && childProp.current) {
    return (
      <AppTreeContext.Provider
        value={{
          tree: tree.children,
          url: tree.url ?? url,
        }}
      >
        {childProp.current}
      </AppTreeContext.Provider>
    )
  }

  if (childProp && !childNodes.has(path)) {
    childNodes.set(path, {
      subTreeData: childProp.current,
      childNodes: new Map(),
    })
    childProp.current = null
  }

  if (!childNodes.has(path)) {
    const data = fetchServerResponse(url, fullTree)
    const root = data.readRoot()

    // Handle case where the response might be for this subrouter
    if (root.data.length === 1 && root.data[0].layoutPath === layoutPath) {
      childNodes.set(path, {
        subTreeData: root.data[0].subTreeData,
        childNodes: new Map(),
      })
    } else {
      // TODO: if the tree did not match up do we provide the new tree here?
      setTimeout(() => {
        // @ts-ignore TODO: startTransition exists
        React.startTransition(() => {
          // TODO: handle redirect
          changeByServerResponse(root)
        })
      })

      // Suspend infinitely as `changeByServerResponse` will cause a different part of the tree to be rendered.
      if (!infinitePromise) infinitePromise = new Promise(() => {})
      throw infinitePromise
    }
  }

  const childNode = childNodes.get(path)
  return (
    <AppTreeContext.Provider
      value={{
        tree: tree.children,
        childNodes: childNode.childNodes,
        url: tree.url ?? url,
      }}
    >
      {childNode.subTreeData}
    </AppTreeContext.Provider>
  )
}

function LoadingBoundary({
  children,
  loading,
}: {
  children: React.ReactNode
  loading?: React.ReactNode
}) {
  if (loading) {
    return <React.Suspense fallback={loading}>{children}</React.Suspense>
  }

  return <>{children}</>
}

export default function OuterLayoutRouter({
  layoutPath,
  childProp,
  loading,
}: any) {
  const { childNodes, tree, url } = useContext(AppTreeContext)

  const currentChildSegment = tree.children.segment ?? childProp.segment
  const preservedSegments: string[] = [currentChildSegment]

  return (
    <>
      {preservedSegments.map((preservedSegment) => {
        return (
          <LoadingBoundary loading={loading} key={preservedSegment}>
            <InnerLayoutRouter
              url={url}
              tree={tree}
              childNodes={childNodes}
              childProp={
                childProp.segment === preservedSegment ? childProp : null
              }
              layoutPath={layoutPath}
              path={preservedSegment}
              isActive={currentChildSegment === preservedSegment}
            />
          </LoadingBoundary>
        )
      })}
    </>
  )
}
