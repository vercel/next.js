import React, { useContext } from 'react'
import type { ChildProp } from '../../server/app-render'
import type { CacheNode } from '../../shared/lib/app-router-context'
import type {
  FlightRouterState,
  FlightSegmentPath,
  FlightDataPath,
} from '../../server/app-render'
import {
  AppTreeContext,
  FullAppTreeContext,
} from '../../shared/lib/app-router-context'
import { fetchServerResponse } from './app-router.client'

let infinitePromise: Promise<void>

export function InnerLayoutRouter({
  parallelRouterKey,
  url,
  childNodes,
  childProp,
  segmentPath,
  tree,
  // isActive,
  path,
}: {
  parallelRouterKey: string
  url: string
  childNodes: CacheNode['parallelRoutes']['children']
  childProp: ChildProp | null
  segmentPath: FlightSegmentPath
  tree: FlightRouterState
  isActive: boolean
  path: string
}) {
  const { changeByServerResponse, tree: fullTree } =
    useContext(FullAppTreeContext)

  if (childProp && !childNodes.has(path)) {
    childNodes.set(path, {
      subTreeData: childProp.current,
      parallelRoutes: {
        [parallelRouterKey]: new Map(),
      },
    })
    childProp.current = null
  }

  if (!childNodes.has(path)) {
    console.log('KICKING OFF DATA FETCH IN RENDER', {
      path,
      childNodes: new Map(childNodes),
      fullTree,
    })
    const data = fetchServerResponse(new URL(url, location.origin), fullTree)
    childNodes.set(path, {
      data,
      subTreeData: null,
      parallelRoutes: {
        [parallelRouterKey]: new Map(),
      },
    })
  }

  const childNode = childNodes.get(path)!

  if (childNode.data) {
    // TODO: error case
    const root = childNode.data.readRoot()

    console.log('ROOT', root)
    const matchesTree = (
      tree: FlightDataPath,
      segmentPath: FlightSegmentPath
    ): {
      matches: boolean
      reason?: string
    } => {
      // Segment matches
      if (segmentPath[0] === tree[0]) {
        // Both don't have further segments
        if (!segmentPath[1] && !tree[1]) {
          return {
            matches: true,
          }
        }

        // tree has further segments but segment doesn't
        if (!segmentPath[1]) {
          return {
            matches: false,
          }
        }

        // Both have further segments and parallel router key matches
        if (segmentPath[1] && tree[1] && segmentPath[1][0] === tree[1][0]) {
          // segmentPath has further segments
          if (segmentPath[1][1]) {
            return matchesTree(tree[1][1], segmentPath[1][1])
          }
        }
      }

      return {
        matches: false,
      }
    }

    // Handle case where the response might be for this subrouter

    if (root.length === 1) {
      const matches = matchesTree(root[0], segmentPath)

      // layoutpath === with the tree from the server
      // happy path and the childNodes would be seeded and data set to null
      if (matches) {
        // childNode.data = null
        // childNode.subTreeData = root[0].
        // childNode.childNodes = new Map()
      }
      console.log(matches)
    } else {
      // For push we can set data in the cache

      // layoutpath is deeper than the tree from the server
      // const currentData = childNode.data
      // childNode.data = null
      // keep recursing down the tree until it matches
      // deeperNode.data = currentData
      // copy the the cache upward back to where the childNode was
      // childNode.childNodes = clonedCache

      // layoutpath does not match the tree from the server
      // See code below that handles this case at the root
      childNode.data = null

      // TODO: if the tree did not match up do we provide the new tree here?
      setTimeout(() => {
        // @ts-ignore TODO: startTransition exists
        React.startTransition(() => {
          // TODO: handle redirect
          changeByServerResponse(fullTree, root)
        })
      })
    }

    // Suspend infinitely as `changeByServerResponse` will cause a different part of the tree to be rendered.
    if (!infinitePromise) infinitePromise = new Promise(() => {})
    throw infinitePromise
  }

  // TODO: double check users can't return null in a component that will kick in here
  if (!childNode.subTreeData) {
    if (!infinitePromise) infinitePromise = new Promise(() => {})
    throw infinitePromise
  }

  return (
    <AppTreeContext.Provider
      value={{
        tree: tree[1][parallelRouterKey],
        childNodes: childNode.parallelRoutes,
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
  parallelRouterKey,
  segmentPath,
  childProp,
  loading,
}: {
  parallelRouterKey: string
  segmentPath: FlightSegmentPath
  childProp: ChildProp
  loading: React.ReactNode | undefined
}) {
  const { childNodes, tree, url } = useContext(AppTreeContext)

  if (!childNodes[parallelRouterKey]) {
    childNodes[parallelRouterKey] = new Map()
  }

  // This relates to the segments in the current router
  // tree[1].children[0] refers to tree.children.segment in the data format
  const currentChildSegment = tree[1][parallelRouterKey][0] ?? childProp.segment
  const preservedSegments: string[] = [currentChildSegment]

  return (
    <>
      {preservedSegments.map((preservedSegment) => {
        return (
          <LoadingBoundary loading={loading} key={preservedSegment}>
            <InnerLayoutRouter
              parallelRouterKey={parallelRouterKey}
              url={url}
              tree={tree}
              childNodes={childNodes[parallelRouterKey]}
              childProp={
                childProp.segment === preservedSegment ? childProp : null
              }
              segmentPath={segmentPath}
              path={preservedSegment}
              isActive={currentChildSegment === preservedSegment}
            />
          </LoadingBoundary>
        )
      })}
    </>
  )
}
