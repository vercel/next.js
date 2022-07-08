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

function readRecordValue(record: Record) {
  if (record.status === RecordStatus.Resolved) {
    return record.value
  } else {
    throw record.value
  }
}

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
    let remainingFlightResponse = ''
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
          const css = responsePartial
            .split('\n')
            .map((partialLine) => {
              const line = remainingFlightResponse + partialLine
              remainingFlightResponse = ''

              try {
                const match = line.match(/^M\d+:(.+)/)
                if (match) {
                  return JSON.parse(match[1])
                    .chunks.filter((chunkId: string) =>
                      chunkId.endsWith('.css')
                    )
                    .map(
                      (file: string) =>
                        `<link rel="stylesheet" href="/_next/${file}">`
                    )
                    .join('')
                }
                return ''
              } catch (err) {
                // The JSON is partial
                remainingFlightResponse = line
                return ''
              }
            })
            .join('')

          writer.write(
            encodeText(
              css +
                `<script>(self.__next_s=self.__next_s||[]).push(${htmlEscapeJsonString(
                  JSON.stringify([1, id, responsePartial])
                )})</script>`
            )
          )
          process()
        }
      })
    }
    process()
  }
  return entry
}

// Create the wrapper component for a Flight stream.
function createServerComponentRenderer(
  ComponentToRender: React.ComponentType,
  ComponentMod: any,
  {
    cachePrefix,
    transformStream,
    serverComponentManifest,
    serverContexts,
  }: {
    cachePrefix: string
    transformStream: TransformStream<Uint8Array, Uint8Array>
    serverComponentManifest: NonNullable<RenderOpts['serverComponentManifest']>
    serverContexts: Array<[ServerContextName: string, JSONValue: any]>
  }
) {
  // We need to expose the `__webpack_require__` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  if (ComponentMod.__next_app_webpack_require__ || ComponentMod.__next_rsc__) {
    // @ts-ignore
    globalThis.__next_require__ =
      ComponentMod.__next_app_webpack_require__ ||
      ComponentMod.__next_rsc__.__webpack_require__

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
  const ServerComponentWrapper = () => {
    const reqStream = createRSCStream()
    const response = useFlightResponse(
      writable,
      cachePrefix,
      reqStream,
      serverComponentManifest
    )
    const root = response.readRoot()
    return root
  }

  return ServerComponentWrapper
}

export type Segment = string | [param: string, value: string]

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
  refresh?: 'refetch'
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
      tree: FlightRouterState,
      subTreeData: React.ReactNode
    ]

export type FlightData = Array<FlightDataPath> | string
export type ChildProp = {
  current: React.ReactNode
  segment: Segment
}

export async function renderToHTML(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts,
  isPagesDir: boolean
): Promise<RenderResult | null> {
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

  // TODO: verify the tree is valid
  // TODO: verify query param is single value (not an array)
  // TODO: verify tree can't grow out of control
  const providedFlightRouterState: FlightRouterState = isFlight
    ? query.__flight_router_state_tree__
      ? JSON.parse(query.__flight_router_state_tree__ as string)
      : {}
    : undefined

  stripInternalQueries(query)

  const hasConcurrentFeatures = !!runtime
  const pageIsDynamic = isDynamicRoute(pathname)

  const LayoutRouter =
    ComponentMod.LayoutRouter as typeof import('../client/components/layout-router.client').default

  const headers = req.headers
  // @ts-expect-error TODO: fix type of req
  const cookies = req.cookies

  const tree: LoaderTree = ComponentMod.tree

  // Reads of this are cached on the `req` object, so this should resolve
  // instantly. There's no need to pass this data down from a previous
  // invoke, where we'd have to consider server & serverless.
  const previewData = tryGetPreviewData(
    req,
    res,
    (renderOpts as any).previewProps
  )
  const isPreview = previewData !== false
  const serverContexts: Array<[string, any]> = [
    ['WORKAROUND', null], // TODO: First value has a bug currently where the value is not set on the second request
    ['HeadersContext', headers],
    ['CookiesContext', cookies],
    ['PreviewDataContext', previewData],
  ]

  const dataCache = new Map<string, Record>()

  type CreateSegmentPath = (child: FlightSegmentPath) => FlightSegmentPath

  const pathParams = (renderOpts as any).params as ParsedUrlQuery

  const getDynamicParamFromSegment = (
    // [id] or [slug]
    segment: string
  ): { param: string; value: string } | null => {
    // TODO: use correct matching for dynamic routes to get segment param
    const segmentParam =
      segment.startsWith('[') && segment.endsWith(']')
        ? segment.slice(1, -1)
        : null

    if (!segmentParam || !pathParams[segmentParam]) {
      return null
    }

    // @ts-expect-error TODO:  handle case where value is an array
    return { param: segmentParam, value: pathParams[segmentParam] }
  }

  const createFlightRouterStateFromLoaderTree = ([
    segment,
    parallelRoutes,
  ]: LoaderTree): FlightRouterState => {
    const dynamicParam = getDynamicParamFromSegment(segment)

    const segmentTree: FlightRouterState = [
      dynamicParam ? [dynamicParam.param, dynamicParam.value] : segment,
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
    return segmentTree
  }

  const createComponentTree = ({
    createSegmentPath,
    tree: [segment, parallelRoutes, { layout, loading, page }],
    parentParams,
    firstItem,
  }: {
    createSegmentPath: CreateSegmentPath
    tree: LoaderTree
    parentParams: { [key: string]: any }
    firstItem?: boolean
  }): { Component: React.ComponentType } => {
    const Loading = loading ? interopDefault(loading()) : undefined
    const layoutOrPageMod = layout ? layout() : page ? page() : undefined
    // TODO: improve detection
    const isPage = !firstItem && segment === ''

    const isClientComponentModule =
      layoutOrPageMod && !layoutOrPageMod.hasOwnProperty('__next_rsc__')

    // Only server components can have getServerSideProps / getStaticProps
    // TODO: friendly error with correct stacktrace. Potentially this can be part of the compiler instead.
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

    const Component = layoutOrPageMod
      ? interopDefault(layoutOrPageMod)
      : undefined

    const segmentParam = getDynamicParamFromSegment(segment)

    const currentParams = segmentParam
      ? {
          ...parentParams,
          [segmentParam.param]: segmentParam.value,
        }
      : parentParams

    const actualSegment = segmentParam
      ? [segmentParam.param, segmentParam.value]
      : segment

    // This happens outside of rendering in order to eagerly kick off data fetching for layouts / the page further down
    const parallelRouteComponents = Object.keys(parallelRoutes).reduce(
      (list, currentValue) => {
        const currentSegmentPath = firstItem
          ? [currentValue]
          : [actualSegment, currentValue]

        const { Component: ChildComponent } = createComponentTree({
          createSegmentPath: (child) => {
            return createSegmentPath([...currentSegmentPath, ...child])
          },
          tree: parallelRoutes[currentValue],
          parentParams: currentParams,
        })

        const childSegmentParam = getDynamicParamFromSegment(
          parallelRoutes[currentValue][0]
        )
        const childProp: ChildProp = {
          current: <ChildComponent />,
          segment: childSegmentParam
            ? [childSegmentParam.param, childSegmentParam.value]
            : parallelRoutes[currentValue][0],
        }

        list[currentValue] = (
          <LayoutRouter
            parallelRouterKey={currentValue}
            segmentPath={createSegmentPath(currentSegmentPath)}
            loading={Loading ? <Loading /> : undefined}
            childProp={childProp}
          />
        )

        return list
      },
      {} as { [key: string]: React.ReactNode }
    )

    // When the segment does not have a layout/page we still have to add the layout router to ensure the path holds the loading component
    if (!Component) {
      return {
        Component: () => <>{parallelRouteComponents.children}</>,
      }
    }

    const segmentPath = createSegmentPath([actualSegment])
    const dataCacheKey = JSON.stringify(segmentPath)
    let fetcher: (() => Promise<any>) | null = null

    type GetServerSidePropsContext = {
      // TODO: has to be serializable
      headers: IncomingHttpHeaders
      cookies: NextApiRequestCookies
      layoutSegments: FlightSegmentPath
      params?: { [key: string]: string | string[] }
      preview?: boolean
      previewData?: string | object | undefined
    }

    type getServerSidePropsContextPage = GetServerSidePropsContext & {
      query: URLSearchParams
      pathname: string
    }

    // TODO: pass a shared cache from previous getStaticProps/getServerSideProps calls?
    if (layoutOrPageMod.getServerSideProps) {
      // TODO: recommendation for i18n
      // locales: (renderOpts as any).locales, // always the same
      // locale: (renderOpts as any).locale, // /nl/something -> nl
      // defaultLocale: (renderOpts as any).defaultLocale, // changes based on domain
      const getServerSidePropsContext:
        | GetServerSidePropsContext
        | getServerSidePropsContextPage = {
        headers,
        // TODO: convert to NextCookies
        cookies,
        layoutSegments: segmentPath,
        // TODO: change this to be URLSearchParams instead?
        ...(isPage ? { query, pathname } : {}),
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
    // TODO: implement layout specific caching for getStaticProps
    if (layoutOrPageMod.getStaticProps) {
      const getStaticPropsContext = {
        layoutSegments: segmentPath,
        // TODO: change this to be URLSearchParams instead?
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
        if (fetcher) {
          // The data fetching was kicked off before rendering (see above)
          // if the data was not resolved yet the layout rendering will be suspended
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
            // TODO: params and query have to be blocked parallel route names. Might have to add a reserved name list.
            // Params are always the current params that apply to the layout
            // If you have a `/dashboard/[team]/layout.js` it will provide `team` as a param but not anything further down.
            params={currentParams}
            // Query is only provided to page
            {...(isPage ? { query } : {})}
          />
        )
      },
    }
  }

  if (isFlight) {
    // TODO: throw on invalid flightRouterState
    const walkTreeWithFlightRouterState = (
      treeToFilter: LoaderTree,
      parentParams: { [key: string]: any },
      flightRouterState?: FlightRouterState,
      parentRendered?: boolean
    ): FlightDataPath => {
      const [segment, parallelRoutes] = treeToFilter
      const parallelRoutesKeys = Object.keys(parallelRoutes)

      const segmentParam = getDynamicParamFromSegment(segment)
      const actualSegment: Segment = segmentParam
        ? [segmentParam.param, segmentParam.value]
        : segment

      const currentParams = segmentParam
        ? {
            ...parentParams,
            [segmentParam.param]: segmentParam.value,
          }
        : parentParams

      const renderComponentsOnThisLevel =
        !flightRouterState ||
        !matchSegment(actualSegment, flightRouterState[0]) ||
        // Last item in the tree
        parallelRoutesKeys.length === 0 ||
        // Explicit refresh
        flightRouterState[3] === 'refetch'

      if (!parentRendered && renderComponentsOnThisLevel) {
        return [
          actualSegment,
          createFlightRouterStateFromLoaderTree(treeToFilter),
          React.createElement(
            createComponentTree(
              // This ensures flightRouterPath is valid and filters down the tree
              {
                createSegmentPath: (child) => child,
                tree: treeToFilter,
                parentParams: currentParams,
                firstItem: true,
              }
            ).Component
          ),
        ]
      }

      for (const parallelRouteKey of parallelRoutesKeys) {
        const parallelRoute = parallelRoutes[parallelRouteKey]
        const path = walkTreeWithFlightRouterState(
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

    const flightData: FlightData = [
      // TODO: change walk to output without ''
      walkTreeWithFlightRouterState(tree, {}, providedFlightRouterState).slice(
        1
      ),
    ]

    return new RenderResult(
      renderToReadableStream(flightData, serverComponentManifest).pipeThrough(
        createBufferedTransformStream()
      )
    )
  }

  const search = stringifyQuery(query)

  // TODO: validate req.url as it gets passed to render.
  const initialCanonicalUrl = req.url

  // TODO: change tree to accommodate this
  // /blog/[...slug]/page.js -> /blog/hello-world/b/c/d -> ['children', 'blog', 'children', ['slug', 'hello-world/b/c/d']]
  // /blog/[slug] /blog/hello-world -> ['children', 'blog', 'children', ['slug', 'hello-world']]
  const initialTree = createFlightRouterStateFromLoaderTree(tree)

  const { Component: ComponentTree } = createComponentTree({
    createSegmentPath: (child) => child,
    tree,
    parentParams: {},
    firstItem: true,
  })

  const AppRouter = ComponentMod.AppRouter
  const {
    QueryContext,
    PathnameContext,
    // ParamsContext,
    // LayoutSegmentsContext,
  } = ComponentMod.hooksClientContext as typeof import('../client/components/hooks-client-context')

  const WrappedComponentTreeWithRouter = () => {
    return (
      <QueryContext.Provider value={query}>
        <PathnameContext.Provider value={pathname}>
          {/* <ParamsContext.Provider value={pathParams}> */}
          <AppRouter
            initialCanonicalUrl={initialCanonicalUrl}
            initialTree={initialTree}
          >
            <ComponentTree />
          </AppRouter>
          {/* </ParamsContext.Provider> */}
        </PathnameContext.Provider>
      </QueryContext.Provider>
    )
  }

  const bootstrapScripts = buildManifest.rootMainFiles.map(
    (src) => '/_next/' + src
  )

  let serverComponentsInlinedTransformStream: TransformStream<
    Uint8Array,
    Uint8Array
  > | null = null

  serverComponentsInlinedTransformStream = new TransformStream()

  const Component = createServerComponentRenderer(
    WrappedComponentTreeWithRouter,
    ComponentMod,
    {
      cachePrefix: pathname + (search ? `?${search}` : ''),
      transformStream: serverComponentsInlinedTransformStream,
      serverComponentManifest,
      serverContexts,
    }
  )

  const jsxStyleRegistry = createStyleRegistry()

  const styledJsxFlushEffect = () => {
    const styles = jsxStyleRegistry.styles()
    jsxStyleRegistry.flush()
    return <>{styles}</>
  }

  const AppContainer = ({ children }: { children: JSX.Element }) => (
    <StyleRegistry registry={jsxStyleRegistry}>{children}</StyleRegistry>
  )

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
      <AppContainer>
        <Component />
      </AppContainer>
    )

    const renderStream = await renderToInitialStream({
      ReactDOMServer,
      element: content,
      streamOptions: {
        bootstrapScripts,
      },
    })

    const flushEffectHandler = (): string => {
      const flushed = ReactDOMServer.renderToString(styledJsxFlushEffect())
      return flushed
    }

    return await continueFromInitialStream(renderStream, {
      suffix: '',
      dataStream: serverComponentsInlinedTransformStream?.readable,
      generateStaticHTML: generateStaticHTML || !hasConcurrentFeatures,
      flushEffectHandler,
    })
  }

  return new RenderResult(await bodyResult())
}
