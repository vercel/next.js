'use client'

import type {
  CacheNode,
  LazyCacheNode,
} from '../../shared/lib/app-router-types'
import type { LoadingModuleData } from '../../shared/lib/app-router-types'
import type {
  FlightRouterState,
  FlightSegmentPath,
  Segment,
} from '../../shared/lib/app-router-types'
import type { ErrorComponent } from './error-boundary'
import {
  ACTION_SERVER_PATCH,
  type FocusAndScrollRef,
} from './router-reducer/router-reducer-types'

import React, {
  Activity,
  useContext,
  use,
  startTransition,
  Suspense,
  useDeferredValue,
  type JSX,
  type ActivityProps,
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
import { disableSmoothScrollDuringRouteTransition } from '../../shared/lib/router/utils/disable-smooth-scroll'
import { RedirectBoundary } from './redirect-boundary'
import { HTTPAccessFallbackBoundary } from './http-access-fallback/error-boundary'
import { createRouterCacheKey } from './router-reducer/create-router-cache-key'
import { hasInterceptionRouteInCurrentTree } from './router-reducer/reducers/has-interception-route-in-current-tree'
import { dispatchAppRouterAction } from './use-action-queue'
import { useRouterBFCache, type RouterBFCacheEntry } from './bfcache'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { PAGE_SEGMENT_KEY } from '../../shared/lib/segment'
import {
  NavigationPromisesContext,
  type NavigationPromises,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import { getParamValueFromCacheKey } from '../route-params'
import type { Params } from '../../server/request/params'

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

      disableSmoothScrollDuringRouteTransition(
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

      // Mutate after scrolling so that it can be read by `disableSmoothScrollDuringRouteTransition`
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
  debugNameContext,
  cacheNode,
  params,
  url,
  isActive,
}: {
  tree: FlightRouterState
  segmentPath: FlightSegmentPath
  debugNameContext: ActivityProps['name']
  cacheNode: CacheNode
  params: Params
  url: string
  isActive: boolean
}) {
  const context = useContext(GlobalLayoutRouterContext)
  const parentNavPromises = useContext(NavigationPromisesContext)

  if (!context) {
    throw new Error('invariant global layout router not mounted')
  }

  const { tree: fullTree } = context

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

    // Only fetch data for the active segment. Inactive segments (rendered
    // offscreen for bfcache) should not trigger fetches.
    if (isActive) {
      // Check if there's already a pending request.
      let lazyData = cacheNode.lazyData
      if (lazyData === null) {
        /**
         * Router state with refetch marker added
         */
        // TODO-APP: remove ''
        const refetchTree = walkAddRefetch(['', ...segmentPath], fullTree)
        const includeNextUrl = hasInterceptionRouteInCurrentTree(fullTree)
        const navigatedAt = Date.now()
        cacheNode.lazyData = lazyData = fetchServerResponse(
          new URL(url, location.origin),
          {
            flightRouterState: refetchTree,
            nextUrl: includeNextUrl
              ? // We always send the last next-url, not the current when
                // performing a dynamic request. This is because we update
                // the next-url after a navigation, but we want the same
                // interception route to be matched that used the last
                // next-url.
                context.previousNextUrl || context.nextUrl
              : null,
          }
        ).then((serverResponse) => {
          startTransition(() => {
            dispatchAppRouterAction({
              type: ACTION_SERVER_PATCH,
              previousTree: fullTree,
              serverResponse,
              navigatedAt,
            })
          })

          return serverResponse
        })

        // Suspend while waiting for lazyData to resolve
        use(lazyData)
      }
    }
    // Suspend infinitely as `changeByServerResponse` will cause a different part of the tree to be rendered.
    // A falsey `resolvedRsc` indicates missing data -- we should not commit that branch, and we need to wait for the data to arrive.
    use(unresolvedThenable) as never
  }

  // If we get to this point, then we know we have something we can render.
  let content = resolvedRsc

  // In dev, we create a NavigationPromisesContext containing the instrumented promises that provide
  // `useSelectedLayoutSegment` and `useSelectedLayoutSegments`.
  // Promises are cached outside of render to survive suspense retries.
  let navigationPromises: NavigationPromises | null = null
  if (process.env.NODE_ENV !== 'production') {
    const { createNestedLayoutNavigationPromises } =
      require('./navigation-devtools') as typeof import('./navigation-devtools')

    navigationPromises = createNestedLayoutNavigationPromises(
      tree,
      parentNavPromises
    )
  }

  if (navigationPromises) {
    content = (
      <NavigationPromisesContext.Provider value={navigationPromises}>
        {resolvedRsc}
      </NavigationPromisesContext.Provider>
    )
  }

  const subtree = (
    // The layout router context narrows down tree and childNodes at each level.
    <LayoutRouterContext.Provider
      value={{
        parentTree: tree,
        parentCacheNode: cacheNode,
        parentSegmentPath: segmentPath,
        parentParams: params,
        debugNameContext: debugNameContext,

        // TODO-APP: overriding of url for parallel routes
        url: url,
        isActive: isActive,
      }}
    >
      {content}
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
  name,
  loading,
  children,
}: {
  name: ActivityProps['name']
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
        name={name}
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
  segmentViewBoundaries,
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
  segmentViewBoundaries?: React.ReactNode
}) {
  const context = useContext(LayoutRouterContext)
  if (!context) {
    throw new Error('invariant expected layout router to be mounted')
  }

  const {
    parentTree,
    parentCacheNode,
    parentSegmentPath,
    parentParams,
    url,
    isActive,
    debugNameContext: parentDebugNameContext,
  } = context

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
  const parentTreeSegment = parentTree[0]
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
  const activeTree = parentTree[1][parallelRouterKey]
  const activeSegment = activeTree[0]
  const activeStateKey = createRouterCacheKey(activeSegment, true) // no search params

  // At each level of the route tree, not only do we render the currently
  // active segment — we also render the last N segments that were active at
  // this level inside a hidden <Activity> boundary, to preserve their state
  // if or when the user navigates to them again.
  //
  // bfcacheEntry is a linked list of FlightRouterStates.
  let bfcacheEntry: RouterBFCacheEntry | null = useRouterBFCache(
    activeTree,
    activeStateKey
  )
  let children: Array<React.ReactNode> = []
  do {
    const tree = bfcacheEntry.tree
    const stateKey = bfcacheEntry.stateKey
    const segment = tree[0]
    const cacheKey = createRouterCacheKey(segment)

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
        navigatedAt: -1,
      }

      // Flight data fetch kicked off during render and put into the cache.
      cacheNode = newLazyCacheNode
      segmentMap.set(cacheKey, newLazyCacheNode)
    }

    /*
    - Error boundary
      - Only renders error boundary if error component is provided.
      - Rendered for each segment to ensure they have their own error state.
      - When gracefully degrade for bots, skip rendering error boundary.
    - Loading boundary
      - Only renders suspense boundary if loading components is provided.
      - Rendered for each segment to ensure they have their own loading state.
      - Passed to the router during rendering to ensure it can be immediately rendered when suspending on a Flight fetch.
  */

    let segmentBoundaryTriggerNode: React.ReactNode = null
    let segmentViewStateNode: React.ReactNode = null
    if (process.env.NODE_ENV !== 'production') {
      const { SegmentBoundaryTriggerNode, SegmentViewStateNode } =
        require('../../next-devtools/userspace/app/segment-explorer-node') as typeof import('../../next-devtools/userspace/app/segment-explorer-node')

      const pagePrefix = normalizeAppPath(url)
      segmentViewStateNode = (
        <SegmentViewStateNode key={pagePrefix} page={pagePrefix} />
      )

      segmentBoundaryTriggerNode = (
        <>
          <SegmentBoundaryTriggerNode />
        </>
      )
    }

    let params = parentParams
    if (Array.isArray(segment)) {
      // This segment contains a route param. Accumulate these as we traverse
      // down the router tree. The result represents the set of params that
      // the layout/page components are permitted to access below this point.
      const paramName = segment[0]
      const paramCacheKey = segment[1]
      const paramType = segment[2]
      const paramValue = getParamValueFromCacheKey(paramCacheKey, paramType)
      if (paramValue !== null) {
        params = {
          ...parentParams,
          [paramName]: paramValue,
        }
      }
    }

    const debugName = getBoundaryDebugNameFromSegment(segment)
    // `debugNameContext` represents the nearest non-"virtual" parent segment.
    // `getBoundaryDebugNameFromSegment` returns null for virtual segments.
    // So if `debugName` is null, the context is passed through unchanged.
    const debugNameContext = debugName ?? parentDebugNameContext

    // TODO: The loading module data for a segment is stored on the parent, then
    // applied to each of that parent segment's parallel route slots. In the
    // simple case where there's only one parallel route (the `children` slot),
    // this is no different from if the loading module data where stored on the
    // child directly. But I'm not sure this actually makes sense when there are
    // multiple parallel routes. It's not a huge issue because you always have
    // the option to define a narrower loading boundary for a particular slot. But
    // this sort of smells like an implementation accident to me.
    const loadingModuleData = parentCacheNode.loading
    let child = (
      <TemplateContext.Provider
        key={stateKey}
        value={
          <ScrollAndFocusHandler segmentPath={segmentPath}>
            <ErrorBoundary
              errorComponent={error}
              errorStyles={errorStyles}
              errorScripts={errorScripts}
            >
              <LoadingBoundary name={debugName} loading={loadingModuleData}>
                <HTTPAccessFallbackBoundary
                  notFound={notFound}
                  forbidden={forbidden}
                  unauthorized={unauthorized}
                >
                  <RedirectBoundary>
                    <InnerLayoutRouter
                      url={url}
                      tree={tree}
                      params={params}
                      cacheNode={cacheNode}
                      segmentPath={segmentPath}
                      debugNameContext={debugNameContext}
                      isActive={isActive && stateKey === activeStateKey}
                    />
                    {segmentBoundaryTriggerNode}
                  </RedirectBoundary>
                </HTTPAccessFallbackBoundary>
              </LoadingBoundary>
            </ErrorBoundary>
            {segmentViewStateNode}
          </ScrollAndFocusHandler>
        }
      >
        {templateStyles}
        {templateScripts}
        {template}
      </TemplateContext.Provider>
    )

    if (process.env.NODE_ENV !== 'production') {
      const { SegmentStateProvider } =
        require('../../next-devtools/userspace/app/segment-explorer-node') as typeof import('../../next-devtools/userspace/app/segment-explorer-node')

      child = (
        <SegmentStateProvider key={stateKey}>
          {child}
          {segmentViewBoundaries}
        </SegmentStateProvider>
      )
    }

    if (process.env.__NEXT_CACHE_COMPONENTS) {
      child = (
        <Activity
          // In practical terms, clicking this name in the Suspense DevTools
          // should select the child slots of that layout.
          //
          // So the name we apply to the Activity boundary is actually based on
          // the nearest parent segments.
          //
          // We skip over "virtual" parents, i.e. ones inserted by Next.js that
          // don't correspond to application-defined code.
          name={debugNameContext}
          key={stateKey}
          mode={stateKey === activeStateKey ? 'visible' : 'hidden'}
        >
          {child}
        </Activity>
      )
    }

    children.push(child)

    bfcacheEntry = bfcacheEntry.next
  } while (bfcacheEntry !== null)

  return children
}

function getBoundaryDebugNameFromSegment(segment: Segment): string | undefined {
  if (segment === '/') {
    // Reached the root
    return '/'
  }
  if (typeof segment === 'string') {
    if (isVirtualLayout(segment)) {
      return undefined
    } else {
      return segment + '/'
    }
  }
  const paramCacheKey = segment[1]
  return paramCacheKey + '/'
}

function isVirtualLayout(segment: string): boolean {
  return (
    // This is inserted by the loader. We should consider encoding these
    // in a more special way instead of checking the name, to distinguish them
    // from app-defined groups.
    segment === '(slot)' ||
    // For some reason, the loader tree sometimes includes extra __PAGE__
    // "layouts" when part of a parallel route. But it's not a leaf node.
    // Otherwise, we wouldn't need this special case because pages are
    // always leaf nodes.
    // TODO: Investigate why the loader produces these fake page segments.
    segment.startsWith(PAGE_SEGMENT_KEY)
  )
}
