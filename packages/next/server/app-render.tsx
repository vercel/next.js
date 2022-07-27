import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http'
import type { LoadComponentsReturnType } from './load-components'
import type { ServerRuntime } from './config-shared'

import React from 'react'
import { ParsedUrlQuery, stringify as stringifyQuery } from 'querystring'
import { createFromReadableStream } from 'next/dist/compiled/react-server-dom-webpack'
import { renderToReadableStream } from 'next/dist/compiled/react-server-dom-webpack/writer.browser.server'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'
import { NextParsedUrlQuery } from './request-meta'
import RenderResult from './render-result'
import {
  readableStreamTee,
  encodeText,
  decodeText,
  renderToInitialStream,
  createBufferedTransformStream,
  continueFromInitialStream,
} from './node-web-streams-helper'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { tryGetPreviewData } from './api-utils/node'
import { htmlEscapeJsonString } from './htmlescape'
import { shouldUseReactRoot, stripInternalQueries } from './utils'
import { NextApiRequestCookies } from './api-utils'
import { matchSegment } from '../client/components/match-segments'

// this needs to be required lazily so that `next-server` can set
// the env before we require
const ReactDOMServer = shouldUseReactRoot
  ? require('react-dom/server.browser')
  : require('react-dom/server')

export type RenderOptsPartial = {
  err?: Error | null
  dev?: boolean
  serverComponentManifest?: any
  supportsDynamicHTML?: boolean
  runtime?: ServerRuntime
  serverComponents?: boolean
}

export type RenderOpts = LoadComponentsReturnType & RenderOptsPartial

/**
 * Interop between "export default" and "module.exports".
 */
function interopDefault(mod: any) {
  return mod.default || mod
}

const rscCache = new Map()

// Shadowing check does not work with TypeScript enums
// eslint-disable-next-line no-shadow
const enum RecordStatus {
  Pending,
  Resolved,
  Rejected,
}

type Record = {
  status: RecordStatus
  value: any
}

/**
 * Create data fetching record for Promise.
 */
function createRecordFromThenable(thenable: Promise<any>) {
  const record: Record = {
    status: RecordStatus.Pending,
    value: thenable,
  }
  thenable.then(
    function (value) {
      if (record.status === RecordStatus.Pending) {
        const resolvedRecord = record
        resolvedRecord.status = RecordStatus.Resolved
        resolvedRecord.value = value
      }
    },
    function (err) {
      if (record.status === RecordStatus.Pending) {
        const rejectedRecord = record
        rejectedRecord.status = RecordStatus.Rejected
        rejectedRecord.value = err
      }
    }
  )
  return record
}

/**
 * Read record value or throw Promise if it's not resolved yet.
 */
function readRecordValue(record: Record) {
  if (record.status === RecordStatus.Resolved) {
    return record.value
  } else {
    throw record.value
  }
}

/**
 * Preload data fetching record before it is called during React rendering.
 * If the record is already in the cache returns that record.
 */
function preloadDataFetchingRecord(
  map: Map<string, Record>,
  key: string,
  fetcher: () => Promise<any> | any
) {
  let record = map.get(key)

  if (!record) {
    const thenable = fetcher()
    record = createRecordFromThenable(thenable)
    map.set(key, record)
  }

  return record
}

/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
function useFlightResponse(
  writable: WritableStream<Uint8Array>,
  cachePrefix: string,
  req: ReadableStream<Uint8Array>,
  serverComponentManifest: any
) {
  const id = cachePrefix + ',' + (React as any).useId()
  let entry = rscCache.get(id)
  if (!entry) {
    const [renderStream, forwardStream] = readableStreamTee(req)
    entry = createFromReadableStream(renderStream, {
      moduleMap: serverComponentManifest.__ssr_module_mapping__,
    })
    rscCache.set(id, entry)

    let bootstrapped = false
    // We only attach CSS chunks to the inlined data.
    const forwardReader = forwardStream.getReader()
    const writer = writable.getWriter()
    function process() {
      forwardReader.read().then(({ done, value }) => {
        if (!bootstrapped) {
          bootstrapped = true
          writer.write(
            encodeText(
              `<script>(self.__next_s=self.__next_s||[]).push(${htmlEscapeJsonString(
                JSON.stringify([0, id])
              )})</script>`
            )
          )
        }
        if (done) {
          rscCache.delete(id)
          writer.close()
        } else {
          const responsePartial = decodeText(value)
          const scripts = `<script>(self.__next_s=self.__next_s||[]).push(${htmlEscapeJsonString(
            JSON.stringify([1, id, responsePartial])
          )})</script>`

          writer.write(encodeText(scripts))
          process()
        }
      })
    }
    process()
  }
  return entry
}

/**
 * Create a component that renders the Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
function createServerComponentRenderer(
  ComponentToRender: React.ComponentType,
  ComponentMod: {
    __next_app_webpack_require__?: any
    __next_rsc__?: {
      __webpack_require__?: any
    }
  },
  {
    cachePrefix,
    transformStream,
    serverComponentManifest,
    serverContexts,
  }: {
    cachePrefix: string
    transformStream: TransformStream<Uint8Array, Uint8Array>
    serverComponentManifest: NonNullable<RenderOpts['serverComponentManifest']>
    serverContexts: Array<
      [ServerContextName: string, JSONValue: Object | number | string]
    >
  }
) {
  // We need to expose the `__webpack_require__` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  if (ComponentMod.__next_app_webpack_require__ || ComponentMod.__next_rsc__) {
    // @ts-ignore
    globalThis.__next_require__ =
      ComponentMod.__next_app_webpack_require__ ||
      ComponentMod.__next_rsc__?.__webpack_require__

    // @ts-ignore
    globalThis.__next_chunk_load__ = () => Promise.resolve()
  }

  let RSCStream: ReadableStream<Uint8Array>
  const createRSCStream = () => {
    if (!RSCStream) {
      RSCStream = renderToReadableStream(
        <ComponentToRender />,
        serverComponentManifest,
        {
          context: serverContexts,
        }
      )
    }
    return RSCStream
  }

  const writable = transformStream.writable
  return function ServerComponentWrapper() {
    const reqStream = createRSCStream()
    const response = useFlightResponse(
      writable,
      cachePrefix,
      reqStream,
      serverComponentManifest
    )
    return response.readRoot()
  }
}

type DynamicParamTypes = 'catchall' | 'optional-catchall' | 'dynamic'
// c = catchall
// oc = optional catchall
// d = dynamic
export type DynamicParamTypesShort = 'c' | 'oc' | 'd'

function getShortDynamicParamType(
  type: DynamicParamTypes
): DynamicParamTypesShort {
  switch (type) {
    case 'catchall':
      return 'c'
    case 'optional-catchall':
      return 'oc'
    case 'dynamic':
      return 'd'
    default:
      throw new Error('Unknown dynamic param type')
  }
}

export type Segment =
  | string
  | [param: string, value: string, type: DynamicParamTypesShort]

type LoaderTree = [
  segment: string,
  parallelRoutes: { [parallelRouterKey: string]: LoaderTree },
  components: {
    layout?: () => any
    loading?: () => any
    page?: () => any
  }
]

export type FlightRouterState = [
  segment: Segment,
  parallelRoutes: { [parallelRouterKey: string]: FlightRouterState },
  url?: string,
  refresh?: 'refetch',
  loading?: 'loading'
]

export type FlightSegmentPath =
  | any[]
  // Looks somewhat like this
  | [
      segment: Segment,
      parallelRouterKey: string,
      segment: Segment,
      parallelRouterKey: string,
      segment: Segment,
      parallelRouterKey: string
    ]

export type FlightDataPath =
  | any[]
  // Looks somewhat like this
  | [
      segment: Segment,
      parallelRoute: string,
      segment: Segment,
      parallelRoute: string,
      segment: Segment,
      parallelRoute: string,
      currentSegment: Segment,
      tree: FlightRouterState,
      subTreeData: React.ReactNode
    ]

export type FlightData = Array<FlightDataPath> | string
export type ChildProp = {
  current: React.ReactNode
  segment: Segment
}

/**
 * Parse dynamic route segment to type of parameter
 */
function getSegmentParam(segment: string): {
  param: string
  type: DynamicParamTypes
} | null {
  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return {
      type: 'optional-catchall',
      param: segment.slice(5, -2),
    }
  }

  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return {
      type: 'catchall',
      param: segment.slice(4, -1),
    }
  }

  if (segment.startsWith('[') && segment.endsWith(']')) {
    return {
      type: 'dynamic',
      param: segment.slice(1, -1),
    }
  }

  return null
}

/**
 * Get inline <link> tags based on __next_rsc_css__ manifest. Only used when rendering to HTML.
 */
function getCssInlinedLinkTags(
  ComponentMod: any,
  serverComponentManifest: any
) {
  const importedServerCSSFiles: string[] =
    ComponentMod.__client__?.__next_rsc_css__ || []

  return Array.from(
    new Set(
      importedServerCSSFiles
        .map((css) =>
          css.endsWith('.css')
            ? serverComponentManifest[css].default.chunks
            : []
        )
        .flat()
    )
  )
}

export async function renderToHTMLOrFlight(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts,
  isPagesDir: boolean
): Promise<RenderResult | null> {
  // @ts-expect-error createServerContext exists in react@experimental + react-dom@experimental
  if (typeof React.createServerContext === 'undefined') {
    throw new Error(
      '"app" directory requires React.createServerContext which is not available in the version of React you are using. Please update to react@experimental and react-dom@experimental.'
    )
  }

  // don't modify original query object
  query = Object.assign({}, query)

  const {
    buildManifest,
    serverComponentManifest,
    supportsDynamicHTML,
    runtime,
    ComponentMod,
  } = renderOpts

  const isFlight = query.__flight__ !== undefined

  // Handle client-side navigation to pages directory
  if (isFlight && isPagesDir) {
    stripInternalQueries(query)
    const search = stringifyQuery(query)

    // Empty so that the client-side router will do a full page navigation.
    const flightData: FlightData = pathname + (search ? `?${search}` : '')
    return new RenderResult(
      renderToReadableStream(flightData, serverComponentManifest).pipeThrough(
        createBufferedTransformStream()
      )
    )
  }

  // TODO-APP: verify the tree is valid
  // TODO-APP: verify query param is single value (not an array)
  // TODO-APP: verify tree can't grow out of control
  /**
   * Router state provided from the client-side router. Used to handle rendering from the common layout down.
   */
  const providedFlightRouterState: FlightRouterState = isFlight
    ? query.__flight_router_state_tree__
      ? JSON.parse(query.__flight_router_state_tree__ as string)
      : {}
    : undefined

  stripInternalQueries(query)

  const pageIsDynamic = isDynamicRoute(pathname)
  const LayoutRouter =
    ComponentMod.LayoutRouter as typeof import('../client/components/layout-router.client').default
  const HotReloader = ComponentMod.HotReloader as
    | typeof import('../client/components/hot-reloader.client').default
    | null

  const headers = req.headers
  // TODO-APP: fix type of req
  // @ts-expect-error
  const cookies = req.cookies

  /**
   * The tree created in next-app-loader that holds component segments and modules
   */
  const loaderTree: LoaderTree = ComponentMod.tree

  // Reads of this are cached on the `req` object, so this should resolve
  // instantly. There's no need to pass this data down from a previous
  // invoke, where we'd have to consider server & serverless.
  const previewData = tryGetPreviewData(
    req,
    res,
    (renderOpts as any).previewProps
  )
  const isPreview = previewData !== false
  /**
   * Server Context is specifically only available in Server Components.
   * It has to hold values that can't change while rendering from the common layout down.
   * An example of this would be that `headers` are available but `searchParams` are not because that'd mean we have to render from the root layout down on all requests.
   */
  const serverContexts: Array<[string, any]> = [
    ['WORKAROUND', null], // TODO-APP: First value has a bug currently where the value is not set on the second request: https://github.com/facebook/react/issues/24849
    ['HeadersContext', headers],
    ['CookiesContext', cookies],
    ['PreviewDataContext', previewData],
  ]

  /**
   * Used to keep track of in-flight / resolved data fetching Promises.
   */
  const dataCache = new Map<string, Record>()

  type CreateSegmentPath = (child: FlightSegmentPath) => FlightSegmentPath

  /**
   * Dynamic parameters. E.g. when you visit `/dashboard/vercel` which is rendered by `/dashboard/[slug]` the value will be {"slug": "vercel"}.
   */
  const pathParams = (renderOpts as any).params as ParsedUrlQuery

  /**
   * Parse the dynamic segment and return the associated value.
   */
  const getDynamicParamFromSegment = (
    // [slug] / [[slug]] / [...slug]
    segment: string
  ): {
    param: string
    value: string | string[] | null
    treeSegment: Segment
    type: DynamicParamTypesShort
  } | null => {
    const segmentParam = getSegmentParam(segment)
    if (!segmentParam) {
      return null
    }

    const key = segmentParam.param
    const value = pathParams[key]

    if (!value) {
      // Handle case where optional catchall does not have a value, e.g. `/dashboard/[...slug]` when requesting `/dashboard`
      if (segmentParam.type === 'optional-catchall') {
        const type = getShortDynamicParamType(segmentParam.type)
        return {
          param: key,
          value: null,
          type: type,
          // This value always has to be a string.
          treeSegment: [key, '', type],
        }
      }
      return null
    }

    const type = getShortDynamicParamType(segmentParam.type)

    return {
      param: key,
      // The value that is passed to user code.
      value: value,
      // The value that is rendered in the router tree.
      treeSegment: [key, Array.isArray(value) ? value.join('/') : value, type],
      type: type,
    }
  }

  const createFlightRouterStateFromLoaderTree = ([
    segment,
    parallelRoutes,
    { loading },
  ]: LoaderTree): FlightRouterState => {
    const hasLoading = Boolean(loading)
    const dynamicParam = getDynamicParamFromSegment(segment)

    const segmentTree: FlightRouterState = [
      dynamicParam ? dynamicParam.treeSegment : segment,
      {},
    ]

    if (parallelRoutes) {
      segmentTree[1] = Object.keys(parallelRoutes).reduce(
        (existingValue, currentValue) => {
          existingValue[currentValue] = createFlightRouterStateFromLoaderTree(
            parallelRoutes[currentValue]
          )
          return existingValue
        },
        {} as FlightRouterState[1]
      )
    }

    if (hasLoading) {
      segmentTree[4] = 'loading'
    }
    return segmentTree
  }

  /**
   * Use the provided loader tree to create the React Component tree.
   */
  const createComponentTree = async ({
    createSegmentPath,
    loaderTree: [segment, parallelRoutes, { layout, loading, page }],
    parentParams,
    firstItem,
    rootLayoutIncluded,
  }: {
    createSegmentPath: CreateSegmentPath
    loaderTree: LoaderTree
    parentParams: { [key: string]: any }
    rootLayoutIncluded?: boolean
    firstItem?: boolean
  }): Promise<{ Component: React.ComponentType }> => {
    const Loading = loading ? await interopDefault(loading()) : undefined
    const isLayout = typeof layout !== 'undefined'
    const isPage = typeof page !== 'undefined'
    const layoutOrPageMod = isLayout
      ? await layout()
      : isPage
      ? await page()
      : undefined
    /**
     * Checks if the current segment is a root layout.
     */
    const rootLayoutAtThisLevel = isLayout && !rootLayoutIncluded
    /**
     * Checks if the current segment or any level above it has a root layout.
     */
    const rootLayoutIncludedAtThisLevelOrAbove =
      rootLayoutIncluded || rootLayoutAtThisLevel

    /**
     * Check if the current layout/page is a client component
     */
    const isClientComponentModule =
      layoutOrPageMod && !layoutOrPageMod.hasOwnProperty('__next_rsc__')

    // Only server components can have getServerSideProps / getStaticProps
    // TODO-APP: friendly error with correct stacktrace. Potentially this can be part of the compiler instead.
    if (isClientComponentModule) {
      if (layoutOrPageMod.getServerSideProps) {
        throw new Error(
          'getServerSideProps is not supported on Client Components'
        )
      }

      if (layoutOrPageMod.getStaticProps) {
        throw new Error('getStaticProps is not supported on Client Components')
      }
    }

    /**
     * The React Component to render.
     */
    const Component = layoutOrPageMod
      ? interopDefault(layoutOrPageMod)
      : undefined

    // Handle dynamic segment params.
    const segmentParam = getDynamicParamFromSegment(segment)
    /**
     * Create object holding the parent params and current params, this is passed to getServerSideProps and getStaticProps.
     */
    const currentParams =
      // Handle null case where dynamic param is optional
      segmentParam && segmentParam.value !== null
        ? {
            ...parentParams,
            [segmentParam.param]: segmentParam.value,
          }
        : // Pass through parent params to children
          parentParams
    // Resolve the segment param
    const actualSegment = segmentParam ? segmentParam.treeSegment : segment

    // This happens outside of rendering in order to eagerly kick off data fetching for layouts / the page further down
    const parallelRouteMap = await Promise.all(
      Object.keys(parallelRoutes).map(
        async (parallelRouteKey): Promise<[string, React.ReactNode]> => {
          const currentSegmentPath: FlightSegmentPath = firstItem
            ? [parallelRouteKey]
            : [actualSegment, parallelRouteKey]

          // Create the child component
          const { Component: ChildComponent } = await createComponentTree({
            createSegmentPath: (child) => {
              return createSegmentPath([...currentSegmentPath, ...child])
            },
            loaderTree: parallelRoutes[parallelRouteKey],
            parentParams: currentParams,
            rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
          })

          const childSegment = parallelRoutes[parallelRouteKey][0]
          const childSegmentParam = getDynamicParamFromSegment(childSegment)
          const childProp: ChildProp = {
            current: <ChildComponent />,
            segment: childSegmentParam
              ? childSegmentParam.treeSegment
              : childSegment,
          }

          // This is turned back into an object below.
          return [
            parallelRouteKey,
            <LayoutRouter
              parallelRouterKey={parallelRouteKey}
              segmentPath={createSegmentPath(currentSegmentPath)}
              loading={Loading ? <Loading /> : undefined}
              childProp={childProp}
              rootLayoutIncluded={rootLayoutIncludedAtThisLevelOrAbove}
            />,
          ]
        }
      )
    )

    // Convert the parallel route map into an object after all promises have been resolved.
    const parallelRouteComponents = parallelRouteMap.reduce(
      (list, [parallelRouteKey, Comp]) => {
        list[parallelRouteKey] = Comp
        return list
      },
      {} as { [key: string]: React.ReactNode }
    )

    // When the segment does not have a layout or page we still have to add the layout router to ensure the path holds the loading component
    if (!Component) {
      return {
        Component: () => <>{parallelRouteComponents.children}</>,
      }
    }

    const segmentPath = createSegmentPath([actualSegment])
    const dataCacheKey = JSON.stringify(segmentPath)
    let fetcher: (() => Promise<any>) | null = null

    type GetServerSidePropsContext = {
      headers: IncomingHttpHeaders
      cookies: NextApiRequestCookies
      layoutSegments: FlightSegmentPath
      params?: { [key: string]: string | string[] }
      preview?: boolean
      previewData?: string | object | undefined
    }

    type getServerSidePropsContextPage = GetServerSidePropsContext & {
      searchParams: URLSearchParams
      pathname: string
    }

    type GetStaticPropsContext = {
      layoutSegments: FlightSegmentPath
      params?: { [key: string]: string | string[] }
      preview?: boolean
      previewData?: string | object | undefined
    }

    type GetStaticPropContextPage = GetStaticPropsContext & {
      pathname: string
    }

    // TODO-APP: pass a shared cache from previous getStaticProps/getServerSideProps calls?
    if (layoutOrPageMod.getServerSideProps) {
      // TODO-APP: recommendation for i18n
      // locales: (renderOpts as any).locales, // always the same
      // locale: (renderOpts as any).locale, // /nl/something -> nl
      // defaultLocale: (renderOpts as any).defaultLocale, // changes based on domain
      const getServerSidePropsContext:
        | GetServerSidePropsContext
        | getServerSidePropsContextPage = {
        headers,
        cookies,
        layoutSegments: segmentPath,
        // TODO-APP: change pathname to actual pathname, it holds the dynamic parameter currently
        ...(isPage ? { searchParams: query, pathname } : {}),
        ...(pageIsDynamic ? { params: currentParams } : undefined),
        ...(isPreview
          ? { preview: true, previewData: previewData }
          : undefined),
      }
      fetcher = () =>
        Promise.resolve(
          layoutOrPageMod.getServerSideProps(getServerSidePropsContext)
        )
    }
    // TODO-APP: implement layout specific caching for getStaticProps
    if (layoutOrPageMod.getStaticProps) {
      const getStaticPropsContext:
        | GetStaticPropsContext
        | GetStaticPropContextPage = {
        layoutSegments: segmentPath,
        ...(isPage ? { pathname } : {}),
        ...(pageIsDynamic ? { params: currentParams } : undefined),
        ...(isPreview
          ? { preview: true, previewData: previewData }
          : undefined),
      }
      fetcher = () =>
        Promise.resolve(layoutOrPageMod.getStaticProps(getStaticPropsContext))
    }

    if (fetcher) {
      // Kick off data fetching before rendering, this ensures there is no waterfall for layouts as
      // all data fetching required to render the page is kicked off simultaneously
      preloadDataFetchingRecord(dataCache, dataCacheKey, fetcher)
    }

    return {
      Component: () => {
        let props
        // The data fetching was kicked off before rendering (see above)
        // if the data was not resolved yet the layout rendering will be suspended
        if (fetcher) {
          const record = preloadDataFetchingRecord(
            dataCache,
            dataCacheKey,
            fetcher
          )
          // Result of calling getStaticProps or getServerSideProps. If promise is not resolve yet it will suspend.
          const recordValue = readRecordValue(record)

          if (props) {
            props = Object.assign({}, props, recordValue.props)
          } else {
            props = recordValue.props
          }
        }

        return (
          <Component
            {...props}
            {...parallelRouteComponents}
            // TODO-APP: params and query have to be blocked parallel route names. Might have to add a reserved name list.
            // Params are always the current params that apply to the layout
            // If you have a `/dashboard/[team]/layout.js` it will provide `team` as a param but not anything further down.
            params={currentParams}
            // Query is only provided to page
            {...(isPage ? { searchParams: query } : {})}
          />
        )
      },
    }
  }

  // Handle Flight render request. This is only used when client-side navigating. E.g. when you `router.push('/dashboard')` or `router.reload()`.
  if (isFlight) {
    // TODO-APP: throw on invalid flightRouterState
    /**
     * Use router state to decide at what common layout to render the page.
     * This can either be the common layout between two pages or a specific place to start rendering from using the "refetch" marker in the tree.
     */
    const walkTreeWithFlightRouterState = async (
      loaderTreeToFilter: LoaderTree,
      parentParams: { [key: string]: string | string[] },
      flightRouterState?: FlightRouterState,
      parentRendered?: boolean
    ): Promise<FlightDataPath> => {
      const [segment, parallelRoutes] = loaderTreeToFilter
      const parallelRoutesKeys = Object.keys(parallelRoutes)

      // Because this function walks to a deeper point in the tree to start rendering we have to track the dynamic parameters up to the point where rendering starts
      // That way even when rendering the subtree getServerSideProps/getStaticProps get the right parameters.
      const segmentParam = getDynamicParamFromSegment(segment)
      const currentParams =
        // Handle null case where dynamic param is optional
        segmentParam && segmentParam.value !== null
          ? {
              ...parentParams,
              [segmentParam.param]: segmentParam.value,
            }
          : parentParams
      const actualSegment: Segment = segmentParam
        ? segmentParam.treeSegment
        : segment

      /**
       * Decide if the current segment is where rendering has to start.
       */
      const renderComponentsOnThisLevel =
        // No further router state available
        !flightRouterState ||
        // Segment in router state does not match current segment
        !matchSegment(actualSegment, flightRouterState[0]) ||
        // Last item in the tree
        parallelRoutesKeys.length === 0 ||
        // Explicit refresh
        flightRouterState[3] === 'refetch'

      if (!parentRendered && renderComponentsOnThisLevel) {
        return [
          actualSegment,
          // Create router state using the slice of the loaderTree
          createFlightRouterStateFromLoaderTree(loaderTreeToFilter),
          // Create component tree using the slice of the loaderTree
          React.createElement(
            (
              await createComponentTree(
                // This ensures flightRouterPath is valid and filters down the tree
                {
                  createSegmentPath: (child) => child,
                  loaderTree: loaderTreeToFilter,
                  parentParams: currentParams,
                  firstItem: true,
                }
              )
            ).Component
          ),
        ]
      }

      // Walk through all parallel routes.
      for (const parallelRouteKey of parallelRoutesKeys) {
        const parallelRoute = parallelRoutes[parallelRouteKey]
        const path = await walkTreeWithFlightRouterState(
          parallelRoute,
          currentParams,
          flightRouterState && flightRouterState[1][parallelRouteKey],
          parentRendered || renderComponentsOnThisLevel
        )

        if (typeof path[path.length - 1] !== 'string') {
          return [actualSegment, parallelRouteKey, ...path]
        }
      }

      return [actualSegment]
    }

    // Flight data that is going to be passed to the browser.
    // Currently a single item array but in the future multiple patches might be combined in a single request.
    const flightData: FlightData = [
      // TODO-APP: change walk to output without ''
      (
        await walkTreeWithFlightRouterState(
          loaderTree,
          {},
          providedFlightRouterState
        )
      ).slice(1),
    ]

    return new RenderResult(
      renderToReadableStream(flightData, serverComponentManifest, {
        context: serverContexts,
      }).pipeThrough(createBufferedTransformStream())
    )
  }

  // Below this line is handling for rendering to HTML.

  // Create full component tree from root to leaf.
  const { Component: ComponentTree } = await createComponentTree({
    createSegmentPath: (child) => child,
    loaderTree: loaderTree,
    parentParams: {},
    firstItem: true,
  })

  // AppRouter is provided by next-app-loader
  const AppRouter =
    ComponentMod.AppRouter as typeof import('../client/components/app-router.client').default

  let serverComponentsInlinedTransformStream: TransformStream<
    Uint8Array,
    Uint8Array
  > = new TransformStream()

  // TODO-APP: validate req.url as it gets passed to render.
  const initialCanonicalUrl = req.url!
  const initialStylesheets: string[] = getCssInlinedLinkTags(
    ComponentMod,
    serverComponentManifest
  )

  /**
   * A new React Component that renders the provided React Component
   * using Flight which can then be rendered to HTML.
   */
  const ServerComponentsRenderer = createServerComponentRenderer(
    () => {
      const initialTree = createFlightRouterStateFromLoaderTree(loaderTree)

      return (
        <AppRouter
          hotReloader={HotReloader && <HotReloader assetPrefix="" />}
          initialCanonicalUrl={initialCanonicalUrl}
          initialTree={initialTree}
          initialStylesheets={initialStylesheets}
        >
          <ComponentTree />
        </AppRouter>
      )
    },
    ComponentMod,
    {
      cachePrefix: initialCanonicalUrl,
      transformStream: serverComponentsInlinedTransformStream,
      serverComponentManifest,
      serverContexts,
    }
  )

  /**
   * Style registry for styled-jsx
   */
  const jsxStyleRegistry = createStyleRegistry()

  /**
   * styled-jsx styles as React Component
   */
  const styledJsxFlushEffect = (): React.ReactNode => {
    const styles = jsxStyleRegistry.styles()
    jsxStyleRegistry.flush()
    return <>{styles}</>
  }

  /**
   * Rules of Static & Dynamic HTML:
   *
   *    1.) We must generate static HTML unless the caller explicitly opts
   *        in to dynamic HTML support.
   *
   *    2.) If dynamic HTML support is requested, we must honor that request
   *        or throw an error. It is the sole responsibility of the caller to
   *        ensure they aren't e.g. requesting dynamic HTML for an AMP page.
   *
   * These rules help ensure that other existing features like request caching,
   * coalescing, and ISR continue working as intended.
   */
  const generateStaticHTML = supportsDynamicHTML !== true
  const bodyResult = async () => {
    const content = (
      <StyleRegistry registry={jsxStyleRegistry}>
        <ServerComponentsRenderer />
      </StyleRegistry>
    )

    const renderStream = await renderToInitialStream({
      ReactDOMServer,
      element: content,
      streamOptions: {
        // Include hydration scripts in the HTML
        bootstrapScripts: buildManifest.rootMainFiles.map(
          (src) => '/_next/' + src
        ),
      },
    })

    const flushEffectHandler = (): string => {
      const flushed = ReactDOMServer.renderToString(styledJsxFlushEffect())
      return flushed
    }

    const hasConcurrentFeatures = !!runtime

    return await continueFromInitialStream(renderStream, {
      dataStream: serverComponentsInlinedTransformStream?.readable,
      generateStaticHTML: generateStaticHTML || !hasConcurrentFeatures,
      flushEffectHandler,
      initialStylesheets,
    })
  }

  return new RenderResult(await bodyResult())
}
