import type { IncomingMessage, ServerResponse } from 'http'
import type { LoadComponentsReturnType } from './load-components'

import React from 'react'
import { stringify as stringifyQuery } from 'querystring'
import { createFromReadableStream } from 'next/dist/compiled/react-server-dom-webpack'
import { renderToReadableStream } from 'next/dist/compiled/react-server-dom-webpack/writer.browser.server'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'
import { NextParsedUrlQuery } from './request-meta'
import RenderResult from './render-result'
import {
  readableStreamTee,
  encodeText,
  decodeText,
  pipeThrough,
  streamFromArray,
  streamToString,
  chainStreams,
  createBufferedTransformStream,
  renderToStream,
} from './node-web-streams-helper'
import { FlushEffectsContext } from '../shared/lib/flush-effects'
// @ts-ignore react-dom/client exists when using React 18
import ReactDOMServer from 'react-dom/server.browser'

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

  const NextId = ({ children }: { children: JSX.Element }) => {
    return <div id="__next">{children}</div>
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
      <html>
        <head>
          {buildManifest.rootMainFiles.map((src) => (
            <script src={'/_next/' + src} defer />
          ))}
        </head>
        <body>
          <NextId>
            <AppContainer>
              <Component />
            </AppContainer>
          </NextId>
        </body>
      </html>
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
