import type { IncomingMessage, ServerResponse } from 'http'
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
import { stripInternalQueries } from './utils'

const ReactDOMServer = process.env.__NEXT_REACT_ROOT
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

  let RSCStream: ReadableStream<Uint8Array>
  const createRSCStream = () => {
    if (!RSCStream) {
      RSCStream = renderToReadableStream(
        <ComponentToRender />,
        serverComponentManifest
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
  const flightRouterPath = isFlight ? query.__flight_router_path__ : undefined

  stripInternalQueries(query)

  const hasConcurrentFeatures = !!runtime
  const pageIsDynamic = isDynamicRoute(pathname)
  const componentPaths = Object.keys(ComponentMod.components)
  const components = componentPaths
    .filter((path) => {
      // Rendering part of the page is only allowed for flight data
      if (flightRouterPath) {
        // TODO: check the actual path
        const pathLength = path.length
        return pathLength > flightRouterPath.length
      }
      return true
    })
    .sort()
    .map((path) => {
      const mod = ComponentMod.components[path]()
      mod.Component = interopDefault(mod)
      mod.path = path
      return mod
    })

  const isSubtreeRender = components.length < componentPaths.length

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
  let WrappedComponent: any

  for (let i = components.length - 1; i >= 0; i--) {
    const dataCacheKey = i.toString()
    const layout = components[i]
    let fetcher: any

    // TODO: pass a shared cache from previous getStaticProps/
    // getServerSideProps calls?
    if (layout.getServerSideProps) {
      fetcher = () =>
        Promise.resolve(
          layout.getServerSideProps!({
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
    if (layout.getStaticProps) {
      fetcher = () =>
        Promise.resolve(
          layout.getStaticProps!({
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

    const LayoutRouter = ComponentMod.LayoutRouter
    const getLoadingMod = ComponentMod.loadingComponents[layout.path]
    const Loading = getLoadingMod ? interopDefault(getLoadingMod()) : null

    // eslint-disable-next-line no-loop-func
    const lastComponent = WrappedComponent
    WrappedComponent = (props: any) => {
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

      const children = React.createElement(
        lastComponent || React.Fragment,
        {},
        null
      )

      // TODO: add tests for loading.js
      const chilrenWithLoading = Loading ? (
        <React.Suspense fallback={<Loading />}>{children}</React.Suspense>
      ) : (
        children
      )

      // Pages don't need to be wrapped in a router
      return React.createElement(
        layout.Component,
        props,
        layout.path.endsWith('/page') ? (
          chilrenWithLoading
        ) : (
          // TODO: only provide the part of the url that is relevant to the layout (see layout-router.client.tsx)
          <LayoutRouter initialUrl={pathname} layoutPath={layout.path}>
            {chilrenWithLoading}
          </LayoutRouter>
        )
      )
    }
    // TODO: loading state
    // const AfterWrap = WrappedComponent
    // WrappedComponent = () => {
    //   return (
    //     <Suspense fallback={<>Loading...</>}>
    //       <AfterWrap />
    //     </Suspense>
    //   )
    // }
  }

  const AppRouter = ComponentMod.AppRouter
  const WrappedComponentWithRouter = () => {
    if (flightRouterPath) {
      return <WrappedComponent />
    }
    return (
      // TODO: verify pathname passed is correct
      <AppRouter initialUrl={pathname}>
        <WrappedComponent />
      </AppRouter>
    )
  }

  const bootstrapScripts = !isSubtreeRender
    ? buildManifest.rootMainFiles.map((src) => '/_next/' + src)
    : undefined

  let serverComponentsInlinedTransformStream: TransformStream<
    Uint8Array,
    Uint8Array
  > | null = null

  serverComponentsInlinedTransformStream = new TransformStream()
  const search = stringifyQuery(query)

  const Component = createServerComponentRenderer(
    WrappedComponentWithRouter,
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

  const renderServerComponentData = isFlight
  if (renderServerComponentData) {
    return new RenderResult(
      renderToReadableStream(
        <WrappedComponentWithRouter />,
        serverComponentManifest
      ).pipeThrough(createBufferedTransformStream())
    )
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

    // Handle static data for server components.
    // async function generateStaticFlightDataIfNeeded() {
    //   if (serverComponentsPageDataTransformStream) {
    //     // If it's a server component with the Node.js runtime, we also
    //     // statically generate the page data.
    //     let data = ''

    //     const readable = serverComponentsPageDataTransformStream.readable
    //     const reader = readable.getReader()
    //     const textDecoder = new TextDecoder()

    //     while (true) {
    //       const { done, value } = await reader.read()
    //       if (done) {
    //         break
    //       }
    //       data += decodeText(value, textDecoder)
    //     }

    //     ;(renderOpts as any).pageData = {
    //       ...(renderOpts as any).pageData,
    //       __flight__: data,
    //     }
    //     return data
    //   }
    // }

    // @TODO: A potential improvement would be to reuse the inlined
    // data stream, or pass a callback inside as this doesn't need to
    // be streamed.
    // Do not use `await` here.
    // generateStaticFlightDataIfNeeded()

    return await continueFromInitialStream(renderStream, {
      suffix: '',
      dataStream: serverComponentsInlinedTransformStream?.readable,
      generateStaticHTML: generateStaticHTML || !hasConcurrentFeatures,
      flushEffectHandler,
    })
  }

  return new RenderResult(await bodyResult())
}
