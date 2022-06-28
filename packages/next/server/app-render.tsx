import type { IncomingMessage, ServerResponse } from 'http'
import type { LoadComponentsReturnType } from './load-components'

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
import { stripInternalQueries } from './utils'

const ReactDOMServer = process.env.__NEXT_REACT_ROOT
  ? require('react-dom/server.browser')
  : require('react-dom/server')

export type RenderOptsPartial = {
  err?: Error | null
  dev?: boolean
  serverComponentManifest?: any
  supportsDynamicHTML?: boolean
  runtime?: 'nodejs' | 'edge'
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
          writer.write(
            encodeText(
              `<script>(self.__next_s=self.__next_s||[]).push(${htmlEscapeJsonString(
                JSON.stringify([1, id, decodeText(value)])
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
  }: {
    cachePrefix: string
    transformStream: TransformStream<Uint8Array, Uint8Array>
    serverComponentManifest: NonNullable<RenderOpts['serverComponentManifest']>
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

  const writable = transformStream.writable
  const ServerComponentWrapper = () => {
    const reqStream: ReadableStream<Uint8Array> = renderToReadableStream(
      <ComponentToRender />,
      serverComponentManifest
    )

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
  segment: string,
  parallelRoutes: { [parallelRouterKey: string]: FlightRouterState },
  url?: string,
  refresh?: 'refetch'
]

export type FlightSegmentPath =
  | any[]
  // Looks somewhat like this
  | [
      segment: string,
      parallelRouterKey: string,
      segment: string,
      parallelRouterKey: string,
      segment: string,
      parallelRouterKey: string
    ]

export type FlightDataPath =
  | any[]
  // Looks somewhat like this
  | [
      segment: string,
      parallelRoute: string,
      segment: string,
      parallelRoute: string,
      segment: string,
      parallelRoute: string,
      tree: FlightRouterState,
      subTreeData: React.ReactNode
    ]

export type FlightData = Array<FlightDataPath>
export type ChildProp = { current: React.ReactNode; segment: string }

export async function renderToHTML(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts
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
  const dataCache = new Map<string, Record>()

  type CreateSegmentPath = (child: FlightSegmentPath) => FlightSegmentPath

  const createFlightRouterStateFromLoaderTree = (
    [segment, parallelRoutes]: LoaderTree,
    url?: string
  ): FlightRouterState => {
    const segmentTree: FlightRouterState = [segment, {}]
    if (url) {
      segmentTree.push(url)
    }

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
  }: {
    createSegmentPath: CreateSegmentPath
    tree: LoaderTree
  }): { Component: React.ComponentType } => {
    const Loading = loading ? interopDefault(loading()) : undefined
    const layoutOrPageMod = layout ? layout() : page ? page() : undefined
    const Component = layoutOrPageMod
      ? interopDefault(layoutOrPageMod)
      : undefined

    // When this segment does not have a layout or page render the children without wrapping in a layout router
    if (!Component) {
      const { Component: Children } = createComponentTree({
        createSegmentPath: (child) => {
          return createSegmentPath([segment, 'children', ...child])
        },
        tree: parallelRoutes.children,
      })
      // If the segment has a loading.js still wrap with a loading component
      if (Loading) {
        return {
          Component: () => (
            <React.Suspense fallback={<Loading />}>
              <Children />
            </React.Suspense>
          ),
        }
      }
      return {
        Component: Children,
      }
    }

    // This happens outside of rendering in order to eagerly kick off data fetching for layouts / the page further down
    const parallelRouteComponents = Object.keys(parallelRoutes).reduce(
      (list, currentValue) => {
        const { Component: ChildComponent } = createComponentTree({
          createSegmentPath: (child) => {
            return createSegmentPath([segment, currentValue, ...child])
          },
          tree: parallelRoutes[currentValue],
        })

        const childProp: ChildProp = {
          current: <ChildComponent />,
          segment: parallelRoutes[currentValue][0],
        }

        list[currentValue] = (
          <LayoutRouter
            parallelRouterKey={currentValue}
            // TODO: construct this path client-side instead.
            segmentPath={createSegmentPath([segment, currentValue])}
            loading={Loading ? <Loading /> : undefined}
            childProp={childProp}
          />
        )

        return list
      },
      {} as { [key: string]: React.ReactNode }
    )

    const segmentPath = createSegmentPath([segment])
    const dataCacheKey = JSON.stringify(segmentPath)
    let fetcher: any

    // TODO: pass a shared cache from previous getStaticProps/getServerSideProps calls?
    // TODO: update parameters particular to layout
    if (layoutOrPageMod.getServerSideProps) {
      fetcher = () =>
        Promise.resolve(
          layoutOrPageMod.getServerSideProps!({
            req: req as any,
            res: res,
            query,
            resolvedUrl: (renderOpts as any).resolvedUrl as string,
            ...(pageIsDynamic
              ? { params: (renderOpts as any).params as ParsedUrlQuery }
              : undefined),
            ...(isPreview
              ? { preview: true, previewData: previewData }
              : undefined),
            locales: (renderOpts as any).locales,
            locale: (renderOpts as any).locale,
            defaultLocale: (renderOpts as any).defaultLocale,
          })
        )
    }
    // TODO: implement layout specific caching for getStaticProps
    // TODO: update parameters particular to layout
    if (layoutOrPageMod.getStaticProps) {
      fetcher = () =>
        Promise.resolve(
          layoutOrPageMod.getStaticProps!({
            ...(pageIsDynamic
              ? { params: query as ParsedUrlQuery }
              : undefined),
            ...(isPreview
              ? { preview: true, previewData: previewData }
              : undefined),
            locales: (renderOpts as any).locales,
            locale: (renderOpts as any).locale,
            defaultLocale: (renderOpts as any).defaultLocale,
          })
        )
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

        return <Component {...props} {...parallelRouteComponents} />
      },
    }
  }

  const search = stringifyQuery(query)

  if (isFlight) {
    // TODO: throw on invalid flightRouterState
    // TODO: throw on invalid flightRouterState
    // TODO: throw on invalid flightRouterState
    const walkTreeWithFlightRouterState = (
      treeToFilter: LoaderTree,
      flightRouterState?: FlightRouterState,
      parentRendered?: boolean
    ): FlightDataPath => {
      const [segment, parallelRoutes] = treeToFilter

      const renderComponentsOnThisLevel =
        !flightRouterState ||
        segment !== flightRouterState[0] ||
        // Explicit refresh
        flightRouterState[3] === 'refetch'

      if (!parentRendered && renderComponentsOnThisLevel) {
        return [
          createFlightRouterStateFromLoaderTree(treeToFilter),
          React.createElement(
            createComponentTree(
              // This ensures flightRouterPath is valid and filters down the tree
              {
                createSegmentPath: (child) => child,
                tree: treeToFilter,
              }
            ).Component
          ),
        ]
      }

      for (const parallelRouteKey of Object.keys(parallelRoutes)) {
        const parallelRoute = parallelRoutes[parallelRouteKey]
        const path = walkTreeWithFlightRouterState(
          parallelRoute,
          flightRouterState && flightRouterState[1][parallelRouteKey],
          parentRendered || renderComponentsOnThisLevel
        )

        if (typeof path[path.length - 1] !== 'string') {
          return [segment, parallelRouteKey, ...path]
        }
      }

      return [segment]
    }

    const flightData: FlightData = [
      walkTreeWithFlightRouterState(tree, providedFlightRouterState),
    ]

    return new RenderResult(
      renderToReadableStream(
        // TODO: update `children` to be the children to replace on the client-side
        flightData,
        serverComponentManifest
      ).pipeThrough(createBufferedTransformStream())
    )
  }

  const initialTree = createFlightRouterStateFromLoaderTree(
    tree,
    pathname + (search ? `?${search}` : '')
  )

  const { Component: ComponentTree } = createComponentTree({
    createSegmentPath: (child) => child,
    tree,
  })

  const AppRouter = ComponentMod.AppRouter
  const WrappedComponentTreeWithRouter = () => {
    return (
      <AppRouter initialTree={initialTree}>
        <ComponentTree />
      </AppRouter>
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
