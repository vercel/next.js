import React, { useContext } from 'react'
import type { ChildProp } from '../../server/app-render'
import type { CacheNode } from '../../shared/lib/app-router-context'
import type { FlightRouterState } from '../../server/app-render'
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
}: {
  url: string
  childNodes: CacheNode['childNodes']
  childProp: ChildProp
  layoutPath: string
  tree: FlightRouterState
  isActive: boolean
  path: string
}) {
  const { changeByServerResponse, tree: fullTree } =
    useContext(FullAppTreeContext)

  if (childProp && !childNodes.has(path)) {
    childNodes.set(path, {
      subTreeData: childProp.current,
      childNodes: new Map(),
    })
    childProp.current = null
  }

  if (!childNodes.has(path)) {
    const data = fetchServerResponse(url, fullTree)
    childNodes.set(path, { data, subTreeData: null, childNodes: new Map() })
  }

  const childNode = childNodes.get(path)!

  if (childNode.data) {
    // // TODO: error case
    const root = childNode.data.readRoot()

    // Handle case where the response might be for this subrouter
    // if (root.length === 1 && root[0].layoutPath === layoutPath) {
    //   childNodes.set(path, {
    //     subTreeData: root[0].subTreeData,
    //     childNodes: new Map(),
    //   })
    // } else {
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
  // }

  return (
    <AppTreeContext.Provider
      value={{
        tree: tree[1].children,
        childNodes: childNode.childNodes,
        url: tree[2] ?? url,
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

  // tree[1].children[0] refers to tree.children.segment in the data format
  const currentChildSegment = tree[1].children[0] ?? childProp.segment
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
