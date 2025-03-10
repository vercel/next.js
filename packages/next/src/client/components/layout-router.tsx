'use client'

import type {
  CacheNode,
  LazyCacheNode,
  LoadingModuleData,
} from '../../shared/lib/app-router-context.shared-runtime'
import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../server/app-render/types'
import type { ErrorComponent } from './error-boundary'
import type { FocusAndScrollRef } from './router-reducer/router-reducer-types'

import React, {
  useContext,
  use,
  startTransition,
  Suspense,
  useDeferredValue,
  type JSX,
} from 'react'
import ReactDOM from 'react-dom'
import {
  LayoutRouterContext,
  GlobalLayoutRouterContext,
  TemplateContext,
} from '../../shared/lib/app-router-context.shared-runtime'
import { fetchServerResponse } from './router-reducer/fetch-server-response'
import { unresolvedThenable } from './unresolved-thenable'
import { ErrorBoundary } from './error-boundary'
import { matchSegment } from './match-segments'
import { handleSmoothScroll } from '../../shared/lib/router/utils/handle-smooth-scroll'
import { RedirectBoundary } from './redirect-boundary'
import { HTTPAccessFallbackBoundary } from './http-access-fallback/error-boundary'
import { createRouterCacheKey } from './router-reducer/create-router-cache-key'
import { hasInterceptionRouteInCurrentTree } from './router-reducer/reducers/has-interception-route-in-current-tree'

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

const __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = (
  ReactDOM as any
).__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE

// TODO-APP: Replace with new React API for finding dom nodes without a `ref` when available
/**
 * Wraps ReactDOM.findDOMNode with additional logic to hide React Strict Mode warning
 */
function findDOMNode(
  instance: React.ReactInstance | null | undefined
): Element | Text | null {
  // Tree-shake for server bundle
  if (typeof window === 'undefined') return null

  // __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.findDOMNode is null during module init.
  // We need to lazily reference it.
  const internal_reactDOMfindDOMNode =
    __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.findDOMNode
  return internal_reactDOMfindDOMNode(instance)
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
 * Check if a HTMLElement is hidden or fixed/sticky position
 */
function shouldSkipElement(element: HTMLElement) {
  // we ignore fixed or sticky positioned elements since they'll likely pass the "in-viewport" check
  // and will result in a situation we bail on scroll because of something like a fixed nav,
  // even though the actual page content is offscreen
  if (['sticky', 'fixed'].includes(getComputedStyle(element).position)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        'Skipping auto-scroll behavior due to `position: sticky` or `position: fixed` on element:',
        element
      )
    }
    return true
  }

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

      // If there is no DOM node this layout-router level is skipped. It'll be handled higher-up in the tree.
      if (!(domNode instanceof Element)) {
        return
      }

      // Verify if the element is a HTMLElement and if we want to consider it for scroll behavior.
      // If the element is skipped, try to select the next sibling and try again.
      while (!(domNode instanceof HTMLElement) || shouldSkipElement(domNode)) {
        if (process.env.NODE_ENV !== 'production') {
          if (domNode.parentElement?.localName === 'head') {
            // TODO: We enter this state when metadata was rendered as part of the page or via Next.js.
            // This is always a bug in Next.js and caused by React hoisting metadata.
            // We need to replace `findDOMNode` in favor of Fragment Refs (when available) so that we can skip over metadata.
          }
        }

        // No siblings found that match the criteria are found, so handle scroll higher up in the tree instead.
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
          // In case of hash scroll, we only need to scroll the element into view
          if (hashFragment) {
            ;(domNode as HTMLElement).scrollIntoView()

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
          onlyHashChange: focusAndScrollRef.onlyHashChange,
        }
      )

      // Mutate after scrolling so that it can be read by `handleSmoothScroll`
      focusAndScrollRef.onlyHashChange = false

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
  tree,
  segmentPath,
  cacheNode,
  url,
}: {
  tree: FlightRouterState
  segmentPath: FlightSegmentPath
  cacheNode: CacheNode
  url: string
}) {
  const context = useContext(GlobalLayoutRouterContext)
  if (!context) {
    throw new Error('invariant global layout router not mounted')
  }

  const { changeByServerResponse, tree: fullTree } = context

  // `rsc` represents the renderable node for this segment.

  // If this segment has a `prefetchRsc`, it's the statically prefetched data.
  // We should use that on initial render instead of `rsc`. Then we'll switch
  // to `rsc` when the dynamic response streams in.
  //
  // If no prefetch data is available, then we go straight to rendering `rsc`.
  const resolvedPrefetchRsc =
    cacheNode.prefetchRsc !== null ? cacheNode.prefetchRsc : cacheNode.rsc

  // We use `useDeferredValue` to handle switching between the prefetched and
  // final values. The second argument is returned on initial render, then it
  // re-renders with the first argument.
  const rsc: any = useDeferredValue(cacheNode.rsc, resolvedPrefetchRsc)

  // `rsc` is either a React node or a promise for a React node, except we
  // special case `null` to represent that this segment's data is missing. If
  // it's a promise, we need to unwrap it so we can determine whether or not the
  // data is missing.
  const resolvedRsc: React.ReactNode =
    typeof rsc === 'object' && rsc !== null && typeof rsc.then === 'function'
      ? use(rsc)
      : rsc

  if (!resolvedRsc) {
    // The data for this segment is not available, and there's no pending
    // navigation that will be able to fulfill it. We need to fetch more from
    // the server and patch the cache.

    // Check if there's already a pending request.
    let lazyData = cacheNode.lazyData
    if (lazyData === null) {
      /**
       * Router state with refetch marker added
       */
      // TODO-APP: remove ''
      const refetchTree = walkAddRefetch(['', ...segmentPath], fullTree)
      const includeNextUrl = hasInterceptionRouteInCurrentTree(fullTree)
      cacheNode.lazyData = lazyData = fetchServerResponse(
        new URL(url, location.origin),
        {
          flightRouterState: refetchTree,
          nextUrl: includeNextUrl ? context.nextUrl : null,
        }
      ).then((serverResponse) => {
        startTransition(() => {
          changeByServerResponse({
            previousTree: fullTree,
            serverResponse,
          })
        })

        return serverResponse
      })

      // Suspend while waiting for lazyData to resolve
      use(lazyData)
    }
    // Suspend infinitely as `changeByServerResponse` will cause a different part of the tree to be rendered.
    // A falsey `resolvedRsc` indicates missing data -- we should not commit that branch, and we need to wait for the data to arrive.
    use(unresolvedThenable) as never
  }

  // If we get to this point, then we know we have something we can render.
  const subtree = (
    // The layout router context narrows down tree and childNodes at each level.
    <LayoutRouterContext.Provider
      value={{
        parentTree: tree,
        parentCacheNode: cacheNode,
        parentSegmentPath: segmentPath,

        // TODO-APP: overriding of url for parallel routes
        url: url,
      }}
    >
      {resolvedRsc}
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
  loading,
  children,
}: {
  loading: LoadingModuleData | Promise<LoadingModuleData>
  children: React.ReactNode
}): JSX.Element {
  // If loading is a promise, unwrap it. This happens in cases where we haven't
  // yet received the loading data from the server — which includes whether or
  // not this layout has a loading component at all.
  //
  // It's OK to suspend here instead of inside the fallback because this
  // promise will resolve simultaneously with the data for the segment itself.
  // So it will never suspend for longer than it would have if we didn't use
  // a Suspense fallback at all.
  let loadingModuleData
  if (
    typeof loading === 'object' &&
    loading !== null &&
    typeof (loading as any).then === 'function'
  ) {
    const promiseForLoading = loading as Promise<LoadingModuleData>
    loadingModuleData = use(promiseForLoading)
  } else {
    loadingModuleData = loading as LoadingModuleData
  }

  if (loadingModuleData) {
    const loadingRsc = loadingModuleData[0]
    const loadingStyles = loadingModuleData[1]
    const loadingScripts = loadingModuleData[2]
    return (
      <Suspense
        fallback={
          <>
            {loadingStyles}
            {loadingScripts}
            {loadingRsc}
          </>
        }
      >
        {children}
      </Suspense>
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
  error,
  errorStyles,
  errorScripts,
  templateStyles,
  templateScripts,
  template,
  notFound,
  forbidden,
  unauthorized,
}: {
  parallelRouterKey: string
  error: ErrorComponent | undefined
  errorStyles: React.ReactNode | undefined
  errorScripts: React.ReactNode | undefined
  templateStyles: React.ReactNode | undefined
  templateScripts: React.ReactNode | undefined
  template: React.ReactNode
  notFound: React.ReactNode | undefined
  forbidden: React.ReactNode | undefined
  unauthorized: React.ReactNode | undefined
}) {
  const context = useContext(LayoutRouterContext)
  if (!context) {
    throw new Error('invariant expected layout router to be mounted')
  }

  const { parentTree, parentCacheNode, parentSegmentPath, url } = context

  // Get the CacheNode for this segment by reading it from the parent segment's
  // child map.
  const parentParallelRoutes = parentCacheNode.parallelRoutes
  let segmentMap = parentParallelRoutes.get(parallelRouterKey)
  // If the parallel router cache node does not exist yet, create it.
  // This writes to the cache when there is no item in the cache yet. It never *overwrites* existing cache items which is why it's safe in concurrent mode.
  if (!segmentMap) {
    segmentMap = new Map()
    parentParallelRoutes.set(parallelRouterKey, segmentMap)
  }

  // Get the active segment in the tree
  // The reason arrays are used in the data format is that these are transferred from the server to the browser so it's optimized to save bytes.
  const parentTreeSegment = parentTree[0]
  const tree = parentTree[1][parallelRouterKey]
  const treeSegment = tree[0]

  const segmentPath =
    parentSegmentPath === null
      ? // TODO: The root segment value is currently omitted from the segment
        // path. This has led to a bunch of special cases scattered throughout
        // the code. We should clean this up.
        [parallelRouterKey]
      : parentSegmentPath.concat([parentTreeSegment, parallelRouterKey])

  // The "state" key of a segment is the one passed to React — it represents the
  // identity of the UI tree. Whenever the state key changes, the tree is
  // recreated and the state is reset. In the App Router model, search params do
  // not cause state to be lost, so two segments with the same segment path but
  // different search params should have the same state key.
  //
  // The "cache" key of a segment, however, *does* include the search params, if
  // it's possible that the segment accessed the search params on the server.
  // (This only applies to page segments; layout segments cannot access search
  // params on the server.)
  const cacheKey = createRouterCacheKey(treeSegment)
  const stateKey = createRouterCacheKey(treeSegment, true) // no search params

  // Read segment path from the parallel router cache node.
  let cacheNode = segmentMap.get(cacheKey)
  if (cacheNode === undefined) {
    // When data is not available during rendering client-side we need to fetch
    // it from the server.
    const newLazyCacheNode: LazyCacheNode = {
      lazyData: null,
      rsc: null,
      prefetchRsc: null,
      head: null,
      prefetchHead: null,
      parallelRoutes: new Map(),
      loading: null,
    }

    // Flight data fetch kicked off during render and put into the cache.
    cacheNode = newLazyCacheNode
    segmentMap.set(cacheKey, newLazyCacheNode)
  }

  /*
    - Error boundary
      - Only renders error boundary if error component is provided.
      - Rendered for each segment to ensure they have their own error state.
    - Loading boundary
      - Only renders suspense boundary if loading components is provided.
      - Rendered for each segment to ensure they have their own loading state.
      - Passed to the router during rendering to ensure it can be immediately rendered when suspending on a Flight fetch.
  */

  // TODO: The loading module data for a segment is stored on the parent, then
  // applied to each of that parent segment's parallel route slots. In the
  // simple case where there's only one parallel route (the `children` slot),
  // this is no different from if the loading module data where stored on the
  // child directly. But I'm not sure this actually makes sense when there are
  // multiple parallel routes. It's not a huge issue because you always have
  // the option to define a narrower loading boundary for a particular slot. But
  // this sort of smells like an implementation accident to me.
  const loadingModuleData = parentCacheNode.loading

  return (
    <TemplateContext.Provider
      key={stateKey}
      value={
        <ScrollAndFocusHandler segmentPath={segmentPath}>
          <ErrorBoundary
            errorComponent={error}
            errorStyles={errorStyles}
            errorScripts={errorScripts}
          >
            <LoadingBoundary loading={loadingModuleData}>
              <HTTPAccessFallbackBoundary
                notFound={notFound}
                forbidden={forbidden}
                unauthorized={unauthorized}
              >
                <RedirectBoundary>
                  <InnerLayoutRouter
                    url={url}
                    tree={tree}
                    cacheNode={cacheNode}
                    segmentPath={segmentPath}
                  />
                </RedirectBoundary>
              </HTTPAccessFallbackBoundary>
            </LoadingBoundary>
          </ErrorBoundary>
        </ScrollAndFocusHandler>
      }
    >
      {templateStyles}
      {templateScripts}
      {template}
    </TemplateContext.Provider>
  )
}
