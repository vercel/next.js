import type { IncomingMessage, ServerResponse } from 'http'
import type { LoadComponentsReturnType } from './load-components'

import React from 'react'
import { stringify as stringifyQuery } from 'querystring'
import { createFromReadableStream } from 'next/dist/compiled/react-server-dom-webpack'
import { renderToReadableStream } from 'next/dist/compiled/react-server-dom-webpack/writer.browser.server'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'
import { NextParsedUrlQuery } from './request-meta'
import RenderResult from './render-result'
import { readableStreamTee } from './web/utils'
import { FlushEffectsContext } from '../shared/lib/flush-effects'

const DOCTYPE = '<!DOCTYPE html>'

export type RenderOptsPartial = {
  err?: Error | null
  dev?: boolean
  serverComponentManifest?: any
  renderServerComponentData?: boolean
  serverComponentProps?: any
  supportsDynamicHTML?: boolean
  runtime?: 'nodejs' | 'edge'
  serverComponents?: boolean
  reactRoot: boolean
}

export type RenderOpts = LoadComponentsReturnType & RenderOptsPartial

const rscCache = new Map()

function createRSCHook() {
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

const useRSCResponse = createRSCHook()

// Create the wrapper component for a Flight stream.
function createServerComponentRenderer(
  OriginalComponent: React.ComponentType,
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
  // @ts-ignore
  globalThis.__webpack_require__ = ComponentMod.__next_rsc__.__webpack_require__

  const writable = transformStream.writable
  const ServerComponentWrapper = (props: any) => {
    const id = (React as any).useId()
    const reqStream: ReadableStream<Uint8Array> = renderToReadableStream(
      <OriginalComponent {...props} />,
      serverComponentManifest
    )

    const response = useRSCResponse(
      writable,
      cachePrefix + ',' + id,
      reqStream,
      true
    )
    const root = response.readRoot()
    rscCache.delete(id)
    return root
  }

  const Component = (props: any) => {
    return <ServerComponentWrapper {...props} />
  }

  // Although it's not allowed to attach some static methods to Component,
  // we still re-assign all the component APIs to keep the behavior unchanged.
  for (const methodName of [
    'getInitialProps',
    'getStaticProps',
    'getServerSideProps',
    'getStaticPaths',
  ]) {
    const method = (OriginalComponent as any)[methodName]
    if (method) {
      ;(Component as any)[methodName] = method
    }
  }

  return Component
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
    dev = false,
    serverComponentManifest,
    serverComponentProps,
    supportsDynamicHTML,
    runtime,
    ComponentMod,
    isRootPath,
  } = renderOpts

  const hasConcurrentFeatures = !!runtime

  const OriginalComponent = renderOpts.Component

  // We don't need to opt-into the flight inlining logic if the page isn't a RSC.
  const isServerComponent =
    !!serverComponentManifest &&
    hasConcurrentFeatures &&
    (ComponentMod.__next_rsc__ || isRootPath)

  let Component: React.ComponentType<{}> | ((props: any) => JSX.Element) =
    renderOpts.Component
  let serverComponentsInlinedTransformStream: TransformStream<
    Uint8Array,
    Uint8Array
  > | null = null

  if (isServerComponent) {
    serverComponentsInlinedTransformStream = new TransformStream()
    const search = stringifyQuery(query)
    Component = createServerComponentRenderer(OriginalComponent, ComponentMod, {
      cachePrefix: pathname + (search ? `?${search}` : ''),
      transformStream: serverComponentsInlinedTransformStream,
      serverComponentManifest,
    })
  }

  let { renderServerComponentData } = renderOpts
  if (isServerComponent && query.__flight__) {
    renderServerComponentData = true
    delete query.__flight__
  }

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

  // The `useId` API uses the path indexes to generate an ID for each node.
  // To guarantee the match of hydration, we need to ensure that the structure
  // of wrapper nodes is isomorphic in server and client.
  // TODO: With `enhanceApp` and `enhanceComponents` options, this approach may
  // not be useful.
  // https://github.com/facebook/react/pull/22644
  const Noop = () => null
  const AppContainerWithIsomorphicFiberStructure: React.FC<{
    children: JSX.Element
  }> = ({ children }) => {
    return (
      <>
        {/* <Head/> */}
        <Noop />
        <AppContainer>
          <>
            {/* <ReactDevOverlay/> */}
            {dev ? (
              <>
                {children}
                <Noop />
              </>
            ) : (
              children
            )}
            {/* <RouteAnnouncer/> */}
            <Noop />
          </>
        </AppContainer>
      </>
    )
  }

  if (renderServerComponentData) {
    const stream: ReadableStream<Uint8Array> = renderToReadableStream(
      <OriginalComponent
        {...{
          ...serverComponentProps,
        }}
      />,
      serverComponentManifest
    )

    return new RenderResult(
      pipeThrough(stream, createBufferedTransformStream())
    )
  }

  const Body = ({ children }: { children: JSX.Element }) => {
    return <div id="__next">{children}</div>
  }

  const ReactDOMServer = require('react-dom/server.browser')

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
      <Body>
        <AppContainerWithIsomorphicFiberStructure>
          <Component />
        </AppContainerWithIsomorphicFiberStructure>
      </Body>
    )
    const flushEffectHandler = async () => {
      const allFlushEffects = [styledJsxFlushEffect, ...(flushEffects || [])]
      const flushEffectStream = await renderToStream({
        ReactDOMServer,
        element: (
          <>
            {allFlushEffects.map((flushEffect, i) => (
              <React.Fragment key={i}>{flushEffect()}</React.Fragment>
            ))}
          </>
        ),
        generateStaticHTML: true,
      })

      const flushed = await streamToString(flushEffectStream)
      return flushed
    }

    return await renderToStream({
      ReactDOMServer,
      element: content,
      dataStream: serverComponentsInlinedTransformStream?.readable,
      generateStaticHTML: generateStaticHTML || !hasConcurrentFeatures,
      flushEffectHandler,
    })
  }

  const prefix: Array<string> = []
  prefix.push(DOCTYPE)

  let streams = [streamFromArray(prefix), await bodyResult()]

  return new RenderResult(chainStreams(streams))
}

function createTransformStream<Input, Output>({
  flush,
  transform,
}: {
  flush?: (
    controller: TransformStreamDefaultController<Output>
  ) => Promise<void> | void
  transform?: (
    chunk: Input,
    controller: TransformStreamDefaultController<Output>
  ) => Promise<void> | void
}): TransformStream<Input, Output> {
  const source = new TransformStream()
  const sink = new TransformStream()
  const reader = source.readable.getReader()
  const writer = sink.writable.getWriter()

  const controller = {
    enqueue(chunk: Output) {
      writer.write(chunk)
    },

    error(reason: Error) {
      writer.abort(reason)
      reader.cancel()
    },

    terminate() {
      writer.close()
      reader.cancel()
    },

    get desiredSize() {
      return writer.desiredSize
    },
  }

  ;(async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          const maybePromise = flush?.(controller)
          if (maybePromise) {
            await maybePromise
          }
          writer.close()
          return
        }

        if (transform) {
          const maybePromise = transform(value, controller)
          if (maybePromise) {
            await maybePromise
          }
        } else {
          controller.enqueue(value)
        }
      }
    } catch (err) {
      writer.abort(err)
    }
  })()

  return {
    readable: sink.readable,
    writable: source.writable,
  }
}

function createBufferedTransformStream(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  let bufferedString = ''
  let pendingFlush: Promise<void> | null = null

  const flushBuffer = (controller: TransformStreamDefaultController) => {
    if (!pendingFlush) {
      pendingFlush = new Promise((resolve) => {
        setTimeout(() => {
          controller.enqueue(encodeText(bufferedString))
          bufferedString = ''
          pendingFlush = null
          resolve()
        }, 0)
      })
    }
    return pendingFlush
  }

  return createTransformStream({
    transform(chunk, controller) {
      bufferedString += decodeText(chunk)
      flushBuffer(controller)
    },

    flush() {
      if (pendingFlush) {
        return pendingFlush
      }
    },
  })
}

function createFlushEffectStream(
  handleFlushEffect: () => Promise<string>
): TransformStream<Uint8Array, Uint8Array> {
  return createTransformStream({
    async transform(chunk, controller) {
      const extraChunk = await handleFlushEffect()
      // those should flush together at once
      controller.enqueue(encodeText(extraChunk + decodeText(chunk)))
    },
  })
}

async function renderToStream({
  ReactDOMServer,
  element,
  dataStream,
  generateStaticHTML,
  flushEffectHandler,
}: {
  ReactDOMServer: typeof import('react-dom/server')
  element: React.ReactElement
  dataStream?: ReadableStream<Uint8Array>
  generateStaticHTML: boolean
  flushEffectHandler?: () => Promise<string>
}): Promise<ReadableStream<Uint8Array>> {
  const renderStream: ReadableStream<Uint8Array> & {
    allReady?: Promise<void>
  } = await (ReactDOMServer as any).renderToReadableStream(element)

  if (generateStaticHTML) {
    await renderStream.allReady
  }

  const transforms: Array<TransformStream<Uint8Array, Uint8Array>> = [
    createBufferedTransformStream(),
    flushEffectHandler ? createFlushEffectStream(flushEffectHandler) : null,
    dataStream ? createInlineDataStream(dataStream) : null,
  ].filter(Boolean) as any

  return transforms.reduce(
    (readable, transform) => pipeThrough(readable, transform),
    renderStream
  )
}

function encodeText(input: string) {
  return new TextEncoder().encode(input)
}

function decodeText(input?: Uint8Array) {
  return new TextDecoder().decode(input)
}

function createInlineDataStream(
  dataStream: ReadableStream<Uint8Array>
): TransformStream<Uint8Array, Uint8Array> {
  let dataStreamFinished: Promise<void> | null = null
  return createTransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)

      if (!dataStreamFinished) {
        const dataStreamReader = dataStream.getReader()

        // NOTE: streaming flush
        // We are buffering here for the inlined data stream because the
        // "shell" stream might be chunkenized again by the underlying stream
        // implementation, e.g. with a specific high-water mark. To ensure it's
        // the safe timing to pipe the data stream, this extra tick is
        // necessary.
        dataStreamFinished = new Promise((res) =>
          setTimeout(async () => {
            try {
              while (true) {
                const { done, value } = await dataStreamReader.read()
                if (done) {
                  return res()
                }
                controller.enqueue(value)
              }
            } catch (err) {
              controller.error(err)
            }
            res()
          }, 0)
        )
      }
    },
    flush() {
      if (dataStreamFinished) {
        return dataStreamFinished
      }
    },
  })
}

function pipeTo<T>(
  readable: ReadableStream<T>,
  writable: WritableStream<T>,
  options?: { preventClose: boolean }
) {
  let resolver: () => void
  const promise = new Promise<void>((resolve) => (resolver = resolve))

  const reader = readable.getReader()
  const writer = writable.getWriter()
  function process() {
    reader.read().then(({ done, value }) => {
      if (done) {
        if (options?.preventClose) {
          writer.releaseLock()
        } else {
          writer.close()
        }
        resolver()
      } else {
        writer.write(value)
        process()
      }
    })
  }
  process()
  return promise
}

function pipeThrough<Input, Output>(
  readable: ReadableStream<Input>,
  transformStream: TransformStream<Input, Output>
) {
  pipeTo(readable, transformStream.writable)
  return transformStream.readable
}

function chainStreams<T>(streams: ReadableStream<T>[]): ReadableStream<T> {
  const { readable, writable } = new TransformStream()

  let promise = Promise.resolve()
  for (let i = 0; i < streams.length; ++i) {
    promise = promise.then(() =>
      pipeTo(streams[i], writable, {
        preventClose: i + 1 < streams.length,
      })
    )
  }

  return readable
}

function streamFromArray(strings: string[]): ReadableStream<Uint8Array> {
  // Note: we use a TransformStream here instead of instantiating a ReadableStream
  // because the built-in ReadableStream polyfill runs strings through TextEncoder.
  const { readable, writable } = new TransformStream()

  const writer = writable.getWriter()
  strings.forEach((str) => writer.write(encodeText(str)))
  writer.close()

  return readable
}

async function streamToString(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  const reader = stream.getReader()
  let bufferedString = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      return bufferedString
    }

    bufferedString += decodeText(value)
  }
}
