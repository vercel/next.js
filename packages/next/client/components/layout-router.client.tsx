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

function equalArray(a: any[], b: any[]) {
  return a.length === b.length && a.every((val, i) => val === b[i])
}

function pathMatches(
  flightDataPath: FlightDataPath,
  layoutSegmentPath: FlightSegmentPath
): boolean {
  // The last two items are the tree and subTreeData
  const pathToLayout = flightDataPath.slice(0, -2)
  return equalArray(layoutSegmentPath, pathToLayout)
}

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

  const childNode = childNodes.get(path)
  const isMissingData =
    childNode.subTreeData === null && childNode.data === null

  if (childProp && (!childNode || isMissingData)) {
    childNodes.set(path, {
      subTreeData: childProp.current,
      parallelRoutes: {
        [parallelRouterKey]: new Map(),
      },
    })
    childProp.current = null
  }

  if (!childNode || isMissingData) {
    const walkAddRefetch = (
      segmentPathToWalk: FlightSegmentPath | undefined,
      treeToRecreate: FlightRouterState
    ): FlightRouterState => {
      if (segmentPathToWalk) {
        const [segment, parallelRouteKey] = segmentPathToWalk
        const isLast = segmentPathToWalk.length === 2
        if (treeToRecreate[0] === segment) {
          if (treeToRecreate[1].hasOwnProperty(parallelRouteKey)) {
            if (isLast) {
              const subTree = walkAddRefetch(
                undefined,
                treeToRecreate[1][parallelRouteKey]
              )
              if (!subTree[2]) {
                subTree[2] = undefined
              }
              subTree[3] = 'refetch'
              return [
                treeToRecreate[0],
                {
                  ...treeToRecreate[1],
                  [parallelRouteKey]: [...subTree],
                },
              ]
            }

            return [
              treeToRecreate[0],
              {
                ...treeToRecreate[1],
                [parallelRouteKey]: walkAddRefetch(
                  segmentPathToWalk.slice(2),
                  treeToRecreate[1][parallelRouteKey]
                ),
              },
            ]
          }
        }
      }

      return treeToRecreate
    }

    const data = fetchServerResponse(
      new URL(url, location.origin),
      walkAddRefetch(segmentPath, fullTree)
    )
    childNodes.set(path, {
      data,
      subTreeData: null,
      parallelRoutes: {
        [parallelRouterKey]: new Map(),
      },
    })
  }

  if (childNode.subTreeData && childNode.data) {
    throw new Error('Child node should not have both subTreeData and data')
  }

  if (childNode.data) {
    // TODO: error case
    const root = childNode.data.readRoot()

    let fastPath: boolean = false
    // segmentPath matches what came back from the server. This is the happy path.
    if (root.length === 1) {
      if (pathMatches(root[0], segmentPath)) {
        childNode.data = null
        // Last item is the subtreeData
        // TODO: routerTreePatch needs to be applied to the tree, handle it in render?
        const [, /* routerTreePatch */ subTreeData] = root[0].slice(-2)
        childNode.subTreeData = subTreeData
        childNode.parallelRoutes = {}
        fastPath = true
      }
    }

    if (!fastPath) {
      // For push we can set data in the cache

      // segmentPath from the server does not match the layout's segmentPath
      childNode.data = null

      setTimeout(() => {
        // @ts-ignore TODO: startTransition exists
        React.startTransition(() => {
          // TODO: handle redirect
          changeByServerResponse(fullTree, root)
        })
      })
      // Suspend infinitely as `changeByServerResponse` will cause a different part of the tree to be rendered.
      if (!infinitePromise) infinitePromise = new Promise(() => {})
      throw infinitePromise
    }
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
