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
import { FlushEffectsContext } from '../shared/lib/flush-effects'
// @ts-ignore react-dom/client exists when using React 18
import ReactDOMServer from 'react-dom/server.browser'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { tryGetPreviewData } from './api-utils/node'

export type RenderOptsPartial = {
  err?: Error | null
  dev?: boolean
  serverComponentManifest?: any
  supportsDynamicHTML?: boolean
  runtime?: 'nodejs' | 'edge'
  serverComponents?: boolean
  reactRoot: boolean
}

export type RenderOpts = LoadComponentsReturnType & RenderOptsPartial

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

function createFlightHook() {
  return (
    writable: WritableStream<Uint8Array>,
    id: string,
    req: ReadableStream<Uint8Array>,
    bootstrap: boolean
  ) => {
    let entry = rscCache.get(id)
    if (!entry) {
      const [renderStream, forwardStream] = readableStreamTee(req)
      entry = createFromReadableStream(renderStream)
      rscCache.set(id, entry)

      let bootstrapped = false
      const forwardReader = forwardStream.getReader()
      const writer = writable.getWriter()
      function process() {
        forwardReader.read().then(({ done, value }) => {
          if (bootstrap && !bootstrapped) {
            bootstrapped = true
            writer.write(
              encodeText(
                `<script>(self.__next_s=self.__next_s||[]).push(${JSON.stringify(
                  [0, id]
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
                `<script>(self.__next_s=self.__next_s||[]).push(${JSON.stringify(
                  [1, id, decodeText(value)]
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
}

const useFlightResponse = createFlightHook()

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
  if (ComponentMod.__next_rsc__) {
    // @ts-ignore
    globalThis.__webpack_require__ =
      ComponentMod.__next_rsc__.__webpack_require__

    // @ts-ignore
    globalThis.__webpack_chunk_load__ = () => Promise.resolve()
  }

  const writable = transformStream.writable
  const ServerComponentWrapper = (props: any) => {
    const id = (React as any).useId()
    const reqStream: ReadableStream<Uint8Array> = renderToReadableStream(
      <ComponentToRender {...props} />,
      serverComponentManifest
    )

    const response = useFlightResponse(
      writable,
      cachePrefix + ',' + id,
      reqStream,
      true
    )
    const root = response.readRoot()
    rscCache.delete(id)
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

  const hasConcurrentFeatures = !!runtime
  const pageIsDynamic = isDynamicRoute(pathname)
  const layouts = renderOpts.rootLayouts || []

  layouts.push({
    Component: renderOpts.Component,
    getStaticProps: renderOpts.getStaticProps,
    getServerSideProps: renderOpts.getServerSideProps,
  })

  // Reads of this are cached on the `req` object, so this should resolve
  // instantly. There's no need to pass this data down from a previous
  // invoke, where we'd have to consider server & serverless.
  const previewData = tryGetPreviewData(
    req,
    res,
    (renderOpts as any).previewProps
  )
  const isPreview = previewData !== false

  let WrappedComponent: any
  let RootLayout: any

  const dataCache = new Map<string, Record>()

  for (let i = layouts.length - 1; i >= 0; i--) {
    const dataCacheKey = i.toString()
    const layout = layouts[i]

    if (layout.isRoot) {
      RootLayout = layout.Component
      continue
    }
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

    // eslint-disable-next-line no-loop-func
    const lastComponent = WrappedComponent
    WrappedComponent = () => {
      let props: any
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
        props = recordValue.props
      }

      return React.createElement(
        layout.Component,
        props,
        React.createElement(lastComponent || React.Fragment, {}, null)
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

  if (!RootLayout) {
    // TODO: fallback to our own root layout?
    throw new Error('invariant RootLayout not loaded')
  }

  const headChildren = buildManifest.rootMainFiles.map((src) => (
    <script src={'/_next/' + src} async key={src} />
  ))

  let serverComponentsInlinedTransformStream: TransformStream<
    Uint8Array,
    Uint8Array
  > | null = null

  serverComponentsInlinedTransformStream = new TransformStream()
  const search = stringifyQuery(query)

  const Component = createServerComponentRenderer(RootLayout, ComponentMod, {
    cachePrefix: pathname + (search ? `?${search}` : ''),
    transformStream: serverComponentsInlinedTransformStream,
    serverComponentManifest,
  })

  // const serverComponentProps = query.__props__
  //   ? JSON.parse(query.__props__ as string)
  //   : undefined

  const jsxStyleRegistry = createStyleRegistry()

  const styledJsxFlushEffect = () => {
    const styles = jsxStyleRegistry.styles()
    jsxStyleRegistry.flush()
    return <>{styles}</>
  }

  let flushEffects: Array<() => React.ReactNode> | null = null
  function FlushEffectContainer({ children }: { children: JSX.Element }) {
    // If the client tree suspends, this component will be rendered multiple
    // times before we flush. To ensure we don't call old callbacks corresponding
    // to a previous render, we clear any registered callbacks whenever we render.
    flushEffects = null

    const flushEffectsImpl = React.useCallback(
      (callbacks: Array<() => React.ReactNode>) => {
        if (flushEffects) {
          throw new Error(
            'The `useFlushEffects` hook cannot be used more than once.' +
              '\nRead more: https://nextjs.org/docs/messages/multiple-flush-effects'
          )
        }
        flushEffects = callbacks
      },
      []
    )

    return (
      <FlushEffectsContext.Provider value={flushEffectsImpl}>
        {children}
      </FlushEffectsContext.Provider>
    )
  }

  const AppContainer = ({ children }: { children: JSX.Element }) => (
    <FlushEffectContainer>
      <StyleRegistry registry={jsxStyleRegistry}>{children}</StyleRegistry>
    </FlushEffectContainer>
  )

  const renderServerComponentData = query.__flight__ !== undefined
  if (renderServerComponentData) {
    return new RenderResult(
      renderToReadableStream(
        <RootLayout
          headChildren={headChildren}
          bodyChildren={<WrappedComponent />}
        />,
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
        <Component
          headChildren={headChildren}
          bodyChildren={<WrappedComponent />}
        />
      </AppContainer>
    )

    const renderStream = await renderToInitialStream({
      ReactDOMServer,
      element: content,
    })

    const flushEffectHandler = (): string => {
      const allFlushEffects = [styledJsxFlushEffect, ...(flushEffects || [])]
      const flushed = ReactDOMServer.renderToString(
        <>
          {allFlushEffects.map((flushEffect, i) => (
            <React.Fragment key={i}>{flushEffect()}</React.Fragment>
          ))}
        </>
      )
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

    return await continueFromInitialStream({
      renderStream,
      suffix: '',
      dataStream: serverComponentsInlinedTransformStream?.readable,
      generateStaticHTML: generateStaticHTML || !hasConcurrentFeatures,
      flushEffectHandler,
    })
  }

  return new RenderResult(await bodyResult())
}
