'use client'

import type { ChildSegmentMap } from '../../shared/lib/app-router-context'
import type {
  FlightRouterState,
  FlightSegmentPath,
  ChildProp,
  Segment,
} from '../../server/app-render/types'
import type { ErrorComponent } from './error-boundary'
import type { FocusAndScrollRef } from './router-reducer/router-reducer-types'

import React, { useContext, use } from 'react'
import ReactDOM from 'react-dom'
import {
  CacheStates,
  LayoutRouterContext,
  GlobalLayoutRouterContext,
  TemplateContext,
} from '../../shared/lib/app-router-context'
import { fetchServerResponse } from './router-reducer/fetch-server-response'
import { createInfinitePromise } from './infinite-promise'
import { ErrorBoundary } from './error-boundary'
import { matchSegment } from './match-segments'
import { handleSmoothScroll } from '../../shared/lib/router/utils/handle-smooth-scroll'
import { RedirectBoundary } from './redirect-boundary'
import { NotFoundBoundary } from './not-found-boundary'
import { getSegmentValue } from './router-reducer/reducers/get-segment-value'
import { createRouterCacheKey } from './router-reducer/create-router-cache-key'

/**
 * Add refetch marker to router state at the point of the current layout segment.
 * This ensures the response returned is not further down than the current layout segment.
 */
function walkAddRefetch(
  segmentPathToWalk: FlightSegmentPath | undefined,
  treeToRecreate: FlightRouterState
): FlightRouterState {
  if (segmentPathToWalk) {
    const [segment, parallelRouteKey] = segmentPathToWalk
    const isLast = segmentPathToWalk.length === 2

    if (matchSegment(treeToRecreate[0], segment)) {
      if (treeToRecreate[1].hasOwnProperty(parallelRouteKey)) {
        if (isLast) {
          const subTree = walkAddRefetch(
            undefined,
            treeToRecreate[1][parallelRouteKey]
          )
          return [
            treeToRecreate[0],
            {
              ...treeToRecreate[1],
              [parallelRouteKey]: [
                subTree[0],
                subTree[1],
                subTree[2],
                'refetch',
              ],
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

// TODO-APP: Replace with new React API for finding dom nodes without a `ref` when available
/**
 * Wraps ReactDOM.findDOMNode with additional logic to hide React Strict Mode warning
 */
function findDOMNode(
  instance: Parameters<typeof ReactDOM.findDOMNode>[0]
): ReturnType<typeof ReactDOM.findDOMNode> {
  // Tree-shake for server bundle
  if (typeof window === 'undefined') return null
  // Only apply strict mode warning when not in production
  if (process.env.NODE_ENV !== 'production') {
    const originalConsoleError = console.error
    try {
      console.error = (...messages) => {
        // Ignore strict mode warning for the findDomNode call below
        if (!messages[0].includes('Warning: %s is deprecated in StrictMode.')) {
          originalConsoleError(...messages)
        }
      }
      return ReactDOM.findDOMNode(instance)
    } finally {
      console.error = originalConsoleError!
    }
  }
  return ReactDOM.findDOMNode(instance)
}

const rectProperties = [
  'bottom',
  'height',
  'left',
  'right',
  'top',
  'width',
  'x',
  'y',
] as const
/**
 * Check if a HTMLElement is hidden.
 */
function elementCanScroll(element: HTMLElement) {
  // Uses `getBoundingClientRect` to check if the element is hidden instead of `offsetParent`
  // because `offsetParent` doesn't consider document/body
  const rect = element.getBoundingClientRect()
  return rectProperties.every((item) => rect[item] === 0)
}

/**
 * Check if the top corner of the HTMLElement is in the viewport.
 */
function topOfElementInViewport(element: HTMLElement, viewportHeight: number) {
  const rect = element.getBoundingClientRect()
  return rect.top >= 0 && rect.top <= viewportHeight
}

/**
 * Find the DOM node for a hash fragment.
 * If `top` the page has to scroll to the top of the page. This mirrors the browser's behavior.
 * If the hash fragment is an id, the page has to scroll to the element with that id.
 * If the hash fragment is a name, the page has to scroll to the first element with that name.
 */
function getHashFragmentDomNode(hashFragment: string) {
  // If the hash fragment is `top` the page has to scroll to the top of the page.
  if (hashFragment === 'top') {
    return document.body
  }

  // If the hash fragment is an id, the page has to scroll to the element with that id.
  return (
    document.getElementById(hashFragment) ??
    // If the hash fragment is a name, the page has to scroll to the first element with that name.
    document.getElementsByName(hashFragment)[0]
  )
}
interface ScrollAndFocusHandlerProps {
  focusAndScrollRef: FocusAndScrollRef
  children: React.ReactNode
  segmentPath: FlightSegmentPath
}
class InnerScrollAndFocusHandler extends React.Component<ScrollAndFocusHandlerProps> {
  handlePotentialScroll = () => {
    // Handle scroll and focus, it's only applied once in the first useEffect that triggers that changed.
    const { focusAndScrollRef, segmentPath } = this.props

    if (focusAndScrollRef.apply) {
      // segmentPaths is an array of segment paths that should be scrolled to
      // if the current segment path is not in the array, the scroll is not applied
      // unless the array is empty, in which case the scroll is always applied
      if (
        focusAndScrollRef.segmentPaths.length !== 0 &&
        !focusAndScrollRef.segmentPaths.some((scrollRefSegmentPath) =>
          segmentPath.every((segment, index) =>
            matchSegment(segment, scrollRefSegmentPath[index])
          )
        )
      ) {
        return
      }

      let domNode:
        | ReturnType<typeof getHashFragmentDomNode>
        | ReturnType<typeof findDOMNode> = null
      const hashFragment = focusAndScrollRef.hashFragment

      if (hashFragment) {
        domNode = getHashFragmentDomNode(hashFragment)
      }

      // `findDOMNode` is tricky because it returns just the first child if the component is a fragment.
      // This already caused a bug where the first child was a <link/> in head.
      if (!domNode) {
        domNode = findDOMNode(this)
      }

      // TODO-APP: Handle the case where we couldn't select any DOM node, even higher up in the layout-router above the current segmentPath.
      // If there is no DOM node this layout-router level is skipped. It'll be handled higher-up in the tree.
      if (!(domNode instanceof Element)) {
        return
      }

      // Verify if the element is a HTMLElement and if it's visible on screen (e.g. not display: none).
      // If the element is not a HTMLElement or not visible we try to select the next sibling and try again.
      while (!(domNode instanceof HTMLElement) || elementCanScroll(domNode)) {
        // TODO-APP: Handle the case where we couldn't select any DOM node, even higher up in the layout-router above the current segmentPath.
        // No siblings found that are visible so we handle scroll higher up in the tree instead.
        if (domNode.nextElementSibling === null) {
          return
        }
        domNode = domNode.nextElementSibling
      }

      // State is mutated to ensure that the focus and scroll is applied only once.
      focusAndScrollRef.apply = false
      focusAndScrollRef.hashFragment = null
      focusAndScrollRef.segmentPaths = []

      handleSmoothScroll(
        () => {
          // In case of hash scroll we need to scroll to the top of the element
          if (hashFragment) {
            window.scrollTo(0, (domNode as HTMLElement).offsetTop)
            return
          }
          // Store the current viewport height because reading `clientHeight` causes a reflow,
          // and it won't change during this function.
          const htmlElement = document.documentElement
          const viewportHeight = htmlElement.clientHeight

          // If the element's top edge is already in the viewport, exit early.
          if (topOfElementInViewport(domNode as HTMLElement, viewportHeight)) {
            return
          }

          // Otherwise, try scrolling go the top of the document to be backward compatible with pages
          // scrollIntoView() called on `<html/>` element scrolls horizontally on chrome and firefox (that shouldn't happen)
          // We could use it to scroll horizontally following RTL but that also seems to be broken - it will always scroll left
          // scrollLeft = 0 also seems to ignore RTL and manually checking for RTL is too much hassle so we will scroll just vertically
          htmlElement.scrollTop = 0

          // Scroll to domNode if domNode is not in viewport when scrolled to top of document
          if (!topOfElementInViewport(domNode as HTMLElement, viewportHeight)) {
            // Scroll into view doesn't scroll horizontally by default when not needed
            ;(domNode as HTMLElement).scrollIntoView()
          }
        },
        {
          // We will force layout by querying domNode position
          dontForceLayout: true,
        }
      )

      // Set focus on the element
      domNode.focus()
    }
  }

  componentDidMount() {
    this.handlePotentialScroll()
  }

  componentDidUpdate() {
    // Because this property is overwritten in handlePotentialScroll it's fine to always run it when true as it'll be set to false for subsequent renders.
    if (this.props.focusAndScrollRef.apply) {
      this.handlePotentialScroll()
    }
  }

  render() {
    return this.props.children
  }
}

function ScrollAndFocusHandler({
  segmentPath,
  children,
}: {
  segmentPath: FlightSegmentPath
  children: React.ReactNode
}) {
  const context = useContext(GlobalLayoutRouterContext)
  if (!context) {
    throw new Error('invariant global layout router not mounted')
  }

  return (
    <InnerScrollAndFocusHandler
      segmentPath={segmentPath}
      focusAndScrollRef={context.focusAndScrollRef}
    >
      {children}
    </InnerScrollAndFocusHandler>
  )
}

/**
 * InnerLayoutRouter handles rendering the provided segment based on the cache.
 */
function InnerLayoutRouter({
  parallelRouterKey,
  url,
  childNodes,
  childProp,
  segmentPath,
  tree,
  // TODO-APP: implement `<Offscreen>` when available.
  // isActive,
  cacheKey,
}: {
  parallelRouterKey: string
  url: string
  childNodes: ChildSegmentMap
  childProp: ChildProp | null
  segmentPath: FlightSegmentPath
  tree: FlightRouterState
  isActive: boolean
  cacheKey: ReturnType<typeof createRouterCacheKey>
}) {
  const context = useContext(GlobalLayoutRouterContext)
  if (!context) {
    throw new Error('invariant global layout router not mounted')
  }

  const { changeByServerResponse, tree: fullTree } = context

  // Read segment path from the parallel router cache node.
  let childNode = childNodes.get(cacheKey)

  // If childProp is available this means it's the Flight / SSR case.
  if (
    childProp &&
    // TODO-APP: verify if this can be null based on user code
    childProp.current !== null
  ) {
    if (!childNode) {
      // Add the segment's subTreeData to the cache.
      // This writes to the cache when there is no item in the cache yet. It never *overwrites* existing cache items which is why it's safe in concurrent mode.
      childNodes.set(cacheKey, {
        status: CacheStates.READY,
        data: null,
        subTreeData: childProp.current,
        parallelRoutes: new Map(),
      })
      // In the above case childNode was set on childNodes, so we have to get it from the cacheNodes again.
      childNode = childNodes.get(cacheKey)
    } else {
      if (childNode.status === CacheStates.LAZY_INITIALIZED) {
        // @ts-expect-error we're changing it's type!
        childNode.status = CacheStates.READY
        // @ts-expect-error
        childNode.subTreeData = childProp.current
      }
    }
  }

  // When childNode is not available during rendering client-side we need to fetch it from the server.
  if (!childNode || childNode.status === CacheStates.LAZY_INITIALIZED) {
    /**
     * Router state with refetch marker added
     */
    // TODO-APP: remove ''
    const refetchTree = walkAddRefetch(['', ...segmentPath], fullTree)

    /**
     * Flight data fetch kicked off during render and put into the cache.
     */
    childNodes.set(cacheKey, {
      status: CacheStates.DATA_FETCH,
      data: fetchServerResponse(
        new URL(url, location.origin),
        refetchTree,
        context.nextUrl
      ),
      subTreeData: null,
      head:
        childNode && childNode.status === CacheStates.LAZY_INITIALIZED
          ? childNode.head
          : undefined,
      parallelRoutes:
        childNode && childNode.status === CacheStates.LAZY_INITIALIZED
          ? childNode.parallelRoutes
          : new Map(),
    })
    // In the above case childNode was set on childNodes, so we have to get it from the cacheNodes again.
    childNode = childNodes.get(cacheKey)
  }

  // This case should never happen so it throws an error. It indicates there's a bug in the Next.js.
  if (!childNode) {
    throw new Error('Child node should always exist')
  }

  // This case should never happen so it throws an error. It indicates there's a bug in the Next.js.
  if (childNode.subTreeData && childNode.data) {
    throw new Error('Child node should not have both subTreeData and data')
  }

  // If cache node has a data request we have to unwrap response by `use` and update the cache.
  if (childNode.data) {
    /**
     * Flight response data
     */
    // When the data has not resolved yet `use` will suspend here.
    const [flightData, overrideCanonicalUrl] = use(childNode.data)

    // Handle case when navigating to page in `pages` from `app`
    if (typeof flightData === 'string') {
      window.location.href = url
      return null
    }

    // segmentPath from the server does not match the layout's segmentPath
    childNode.data = null

    // setTimeout is used to start a new transition during render, this is an intentional hack around React.
    setTimeout(() => {
      // @ts-ignore startTransition exists
      React.startTransition(() => {
        changeByServerResponse(fullTree, flightData, overrideCanonicalUrl)
      })
    })
    // Suspend infinitely as `changeByServerResponse` will cause a different part of the tree to be rendered.
    use(createInfinitePromise())
  }

  // If cache node has no subTreeData and no data request we have to infinitely suspend as the data will likely flow in from another place.
  // TODO-APP: double check users can't return null in a component that will kick in here.
  if (!childNode.subTreeData) {
    use(createInfinitePromise())
  }

  const subtree = (
    // The layout router context narrows down tree and childNodes at each level.
    <LayoutRouterContext.Provider
      value={{
        tree: tree[1][parallelRouterKey],
        childNodes: childNode.parallelRoutes,
        // TODO-APP: overriding of url for parallel routes
        url: url,
      }}
    >
      {childNode.subTreeData}
    </LayoutRouterContext.Provider>
  )
  // Ensure root layout is not wrapped in a div as the root layout renders `<html>`
  return subtree
}

/**
 * Renders suspense boundary with the provided "loading" property as the fallback.
 * If no loading property is provided it renders the children without a suspense boundary.
 */
function LoadingBoundary({
  children,
  loading,
  loadingStyles,
  hasLoading,
}: {
  children: React.ReactNode
  loading?: React.ReactNode
  loadingStyles?: React.ReactNode
  hasLoading: boolean
}): JSX.Element {
  if (hasLoading) {
    return (
      <React.Suspense
        fallback={
          <>
            {loadingStyles}
            {loading}
          </>
        }
      >
        {children}
      </React.Suspense>
    )
  }

  return <>{children}</>
}

/**
 * OuterLayoutRouter handles the current segment as well as <Offscreen> rendering of other segments.
 * It can be rendered next to each other with a different `parallelRouterKey`, allowing for Parallel routes.
 */
export default function OuterLayoutRouter({
  parallelRouterKey,
  segmentPath,
  childProp,
  error,
  errorStyles,
  templateStyles,
  loading,
  loadingStyles,
  hasLoading,
  template,
  notFound,
  notFoundStyles,
  asNotFound,
  styles,
}: {
  parallelRouterKey: string
  segmentPath: FlightSegmentPath
  childProp: ChildProp
  error: ErrorComponent
  errorStyles: React.ReactNode | undefined
  templateStyles: React.ReactNode | undefined
  template: React.ReactNode
  loading: React.ReactNode | undefined
  loadingStyles: React.ReactNode | undefined
  hasLoading: boolean
  notFound: React.ReactNode | undefined
  notFoundStyles: React.ReactNode | undefined
  asNotFound?: boolean
  styles?: React.ReactNode
}) {
  const context = useContext(LayoutRouterContext)
  if (!context) {
    throw new Error('invariant expected layout router to be mounted')
  }

  const { childNodes, tree, url } = context

  // Get the current parallelRouter cache node
  let childNodesForParallelRouter = childNodes.get(parallelRouterKey)
  // If the parallel router cache node does not exist yet, create it.
  // This writes to the cache when there is no item in the cache yet. It never *overwrites* existing cache items which is why it's safe in concurrent mode.
  if (!childNodesForParallelRouter) {
    childNodes.set(parallelRouterKey, new Map())
    childNodesForParallelRouter = childNodes.get(parallelRouterKey)!
  }

  // Get the active segment in the tree
  // The reason arrays are used in the data format is that these are transferred from the server to the browser so it's optimized to save bytes.
  const treeSegment = tree[1][parallelRouterKey][0]

  const childPropSegment = childProp.segment

  // If segment is an array it's a dynamic route and we want to read the dynamic route value as the segment to get from the cache.
  const currentChildSegmentValue = getSegmentValue(treeSegment)

  /**
   * Decides which segments to keep rendering, all segments that are not active will be wrapped in `<Offscreen>`.
   */
  // TODO-APP: Add handling of `<Offscreen>` when it's available.
  const preservedSegments: Segment[] = [treeSegment]

  return (
    <>
      {styles}
      {preservedSegments.map((preservedSegment) => {
        const isChildPropSegment = matchSegment(
          preservedSegment,
          childPropSegment
        )
        const preservedSegmentValue = getSegmentValue(preservedSegment)
        const cacheKey = createRouterCacheKey(preservedSegment)

        return (
          /*
            - Error boundary
              - Only renders error boundary if error component is provided.
              - Rendered for each segment to ensure they have their own error state.
            - Loading boundary
              - Only renders suspense boundary if loading components is provided.
              - Rendered for each segment to ensure they have their own loading state.
              - Passed to the router during rendering to ensure it can be immediately rendered when suspending on a Flight fetch.
          */
          <TemplateContext.Provider
            key={createRouterCacheKey(preservedSegment, true)}
            value={
              <ScrollAndFocusHandler segmentPath={segmentPath}>
                <ErrorBoundary errorComponent={error} errorStyles={errorStyles}>
                  <LoadingBoundary
                    hasLoading={hasLoading}
                    loading={loading}
                    loadingStyles={loadingStyles}
                  >
                    <NotFoundBoundary
                      notFound={notFound}
                      notFoundStyles={notFoundStyles}
                      asNotFound={asNotFound}
                    >
                      <RedirectBoundary>
                        <InnerLayoutRouter
                          parallelRouterKey={parallelRouterKey}
                          url={url}
                          tree={tree}
                          childNodes={childNodesForParallelRouter!}
                          childProp={isChildPropSegment ? childProp : null}
                          segmentPath={segmentPath}
                          cacheKey={cacheKey}
                          isActive={
                            currentChildSegmentValue === preservedSegmentValue
                          }
                        />
                      </RedirectBoundary>
                    </NotFoundBoundary>
                  </LoadingBoundary>
                </ErrorBoundary>
              </ScrollAndFocusHandler>
            }
          >
            <>
              {templateStyles}
              {template}
            </>
          </TemplateContext.Provider>
        )
      })}
    </>
  )
}
