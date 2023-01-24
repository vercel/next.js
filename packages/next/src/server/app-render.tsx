import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http'
import type { LoadComponentsReturnType } from './load-components'
import type { ServerRuntime } from '../../types'
import type { FontLoaderManifest } from '../build/webpack/plugins/font-loader-manifest-plugin'

// Import builtin react directly to avoid require cache conflicts
import React, { use } from 'next/dist/compiled/react'
import { NotFound as DefaultNotFound } from '../client/components/error'

// this needs to be required lazily so that `next-server` can set
// the env before we require
import ReactDOMServer from 'next/dist/compiled/react-dom/server.browser'
import { ParsedUrlQuery } from 'querystring'
import { NextParsedUrlQuery } from './request-meta'
import RenderResult from './render-result'
import {
  readableStreamTee,
  encodeText,
  decodeText,
  renderToInitialStream,
  createBufferedTransformStream,
  continueFromInitialStream,
  streamToString,
} from './node-web-streams-helper'
import { ESCAPE_REGEX, htmlEscapeJsonString } from './htmlescape'
import { matchSegment } from '../client/components/match-segments'
import {
  FlightCSSManifest,
  FlightManifest,
} from '../build/webpack/plugins/flight-manifest-plugin'
import { ServerInsertedHTMLContext } from '../shared/lib/server-inserted-html'
import { stripInternalQueries } from './internal-utils'
import type { ComponentsType } from '../build/webpack/loaders/next-app-loader'
import { REDIRECT_ERROR_CODE } from '../client/components/redirect'
import { RequestCookies } from './web/spec-extension/cookies'
import { DYNAMIC_ERROR_CODE } from '../client/components/hooks-server-context'
import { NOT_FOUND_ERROR_CODE } from '../client/components/not-found'
import { NEXT_DYNAMIC_NO_SSR_CODE } from '../shared/lib/no-ssr-error'
import { HeadManagerContext } from '../shared/lib/head-manager-context'
import { Writable } from 'stream'
import stringHash from 'next/dist/compiled/string-hash'
import {
  NEXT_ROUTER_PREFETCH,
  NEXT_ROUTER_STATE_TREE,
  RSC,
} from '../client/components/app-router-headers'
import type { StaticGenerationAsyncStorage } from '../client/components/static-generation-async-storage'
import { formatServerError } from '../lib/format-server-error'
import { Metadata } from '../lib/metadata/metadata'
import type { RequestAsyncStorage } from '../client/components/request-async-storage'
import { runWithRequestAsyncStorage } from './run-with-request-async-storage'
import { runWithStaticGenerationAsyncStorage } from './run-with-static-generation-async-storage'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

function preloadComponent(Component: any, props: any) {
  const prev = console.error
  // Hide invalid hook call warning when calling component
  console.error = function (msg) {
    if (msg.startsWith('Warning: Invalid hook call.')) {
      // ignore
    } else {
      // @ts-expect-error argument is defined
      prev.apply(console, arguments)
    }
  }
  try {
    let result = Component(props)
    if (result && typeof result.then === 'function') {
      // Catch promise rejections to prevent unhandledRejection errors
      result.then(
        () => {},
        () => {}
      )
    }
    return function () {
      // We know what this component will render already.
      return result
    }
  } catch (x) {
    // something suspended or errored, try again later
  } finally {
    console.error = prev
  }
  return Component
}

const CACHE_ONE_YEAR = 31536000
const INTERNAL_HEADERS_INSTANCE = Symbol('internal for headers readonly')

function readonlyHeadersError() {
  return new Error('ReadonlyHeaders cannot be modified')
}
export class ReadonlyHeaders {
  [INTERNAL_HEADERS_INSTANCE]: Headers

  entries: Headers['entries']
  forEach: Headers['forEach']
  get: Headers['get']
  has: Headers['has']
  keys: Headers['keys']
  values: Headers['values']

  constructor(headers: IncomingHttpHeaders) {
    // Since `new Headers` uses `this.append()` to fill the headers object ReadonlyHeaders can't extend from Headers directly as it would throw.
    const headersInstance = new Headers(headers as any)
    this[INTERNAL_HEADERS_INSTANCE] = headersInstance

    this.entries = headersInstance.entries.bind(headersInstance)
    this.forEach = headersInstance.forEach.bind(headersInstance)
    this.get = headersInstance.get.bind(headersInstance)
    this.has = headersInstance.has.bind(headersInstance)
    this.keys = headersInstance.keys.bind(headersInstance)
    this.values = headersInstance.values.bind(headersInstance)
  }
  [Symbol.iterator]() {
    return this[INTERNAL_HEADERS_INSTANCE][Symbol.iterator]()
  }

  append() {
    throw readonlyHeadersError()
  }
  delete() {
    throw readonlyHeadersError()
  }
  set() {
    throw readonlyHeadersError()
  }
}

const INTERNAL_COOKIES_INSTANCE = Symbol('internal for cookies readonly')
class ReadonlyRequestCookiesError extends Error {
  message =
    'ReadonlyRequestCookies cannot be modified. Read more: https://nextjs.org/api-reference/cookies'
}

export class ReadonlyRequestCookies {
  [INTERNAL_COOKIES_INSTANCE]: RequestCookies

  get: RequestCookies['get']
  getAll: RequestCookies['getAll']
  has: RequestCookies['has']

  constructor(request: {
    headers: {
      get(key: 'cookie'): string | null | undefined
    }
  }) {
    // Since `new Headers` uses `this.append()` to fill the headers object ReadonlyHeaders can't extend from Headers directly as it would throw.
    // Request overridden to not have to provide a fully request object.
    const cookiesInstance = new RequestCookies(request.headers as Headers)
    this[INTERNAL_COOKIES_INSTANCE] = cookiesInstance

    this.get = cookiesInstance.get.bind(cookiesInstance)
    this.getAll = cookiesInstance.getAll.bind(cookiesInstance)
    this.has = cookiesInstance.has.bind(cookiesInstance)
  }

  [Symbol.iterator]() {
    return (this[INTERNAL_COOKIES_INSTANCE] as any)[Symbol.iterator]()
  }

  clear() {
    throw new ReadonlyRequestCookiesError()
  }
  delete() {
    throw new ReadonlyRequestCookiesError()
  }
  set() {
    throw new ReadonlyRequestCookiesError()
  }
}

export type RenderOptsPartial = {
  err?: Error | null
  dev?: boolean
  serverComponentManifest?: FlightManifest
  serverCSSManifest?: FlightCSSManifest
  supportsDynamicHTML?: boolean
  runtime?: ServerRuntime
  serverComponents?: boolean
  assetPrefix?: string
  fontLoaderManifest?: FontLoaderManifest
  isBot?: boolean
  incrementalCache?: import('./lib/incremental-cache').IncrementalCache
  isRevalidate?: boolean
  nextExport?: boolean
}

export type RenderOpts = LoadComponentsReturnType & RenderOptsPartial

/**
 * Flight Response is always set to application/octet-stream to ensure it does not get interpreted as HTML.
 */
class FlightRenderResult extends RenderResult {
  constructor(response: string | ReadableStream<Uint8Array>) {
    super(response, { contentType: 'application/octet-stream' })
  }
}

/**
 * Interop between "export default" and "module.exports".
 */
function interopDefault(mod: any) {
  return mod.default || mod
}

// tolerate dynamic server errors during prerendering so console
// isn't spammed with unactionable errors
/**
 * Create error handler for renderers.
 */
function createErrorHandler(
  /**
   * Used for debugging
   */
  _source: string,
  isNextExport: boolean,
  capturedErrors: Error[],
  allCapturedErrors?: Error[]
) {
  return (err: any): string => {
    if (allCapturedErrors) allCapturedErrors.push(err)

    if (
      err &&
      (err.digest === DYNAMIC_ERROR_CODE ||
        err.digest === NOT_FOUND_ERROR_CODE ||
        err.digest === NEXT_DYNAMIC_NO_SSR_CODE ||
        err.digest?.startsWith(REDIRECT_ERROR_CODE))
    ) {
      return err.digest
    }

    // Format server errors in development to add more helpful error messages
    if (process.env.NODE_ENV !== 'production') {
      formatServerError(err)
    }
    // Used for debugging error source
    // console.error(_source, err)

    // Don't log the suppressed error during export
    if (
      !(
        isNextExport &&
        err?.message?.includes(
          'The specific message is omitted in production builds to avoid leaking sensitive details.'
        )
      )
    ) {
      console.error(err)
    }

    capturedErrors.push(err)
    // TODO-APP: look at using webcrypto instead. Requires a promise to be awaited.
    return stringHash(err.message + err.stack + (err.digest || '')).toString()
  }
}

let isFetchPatched = false

// we patch fetch to collect cache information used for
// determining if a page is static or not
function patchFetch(ComponentMod: any) {
  if (isFetchPatched) return
  isFetchPatched = true

  const { DynamicServerError } =
    ComponentMod.serverHooks as typeof import('../client/components/hooks-server-context')

  const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
    ComponentMod.staticGenerationAsyncStorage

  const originFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const staticGenerationStore = staticGenerationAsyncStorage.getStore()

    // If the staticGenerationStore is not available, we can't do any special
    // treatment of fetch, therefore fallback to the original fetch
    // implementation.
    if (!staticGenerationStore) {
      return originFetch(input, init)
    }

    let revalidate: number | undefined | boolean

    if (typeof init?.next?.revalidate === 'number') {
      revalidate = init.next.revalidate
    }

    if (init?.next?.revalidate === false) {
      revalidate = CACHE_ONE_YEAR
    }

    if (
      !staticGenerationStore.revalidate ||
      (typeof revalidate === 'number' &&
        revalidate < staticGenerationStore.revalidate)
    ) {
      staticGenerationStore.revalidate = revalidate
    }

    let cacheKey: string | undefined

    const doOriginalFetch = async () => {
      return originFetch(input, init).then(async (res) => {
        if (
          staticGenerationStore.incrementalCache &&
          cacheKey &&
          typeof revalidate === 'number' &&
          revalidate > 0
        ) {
          const clonedRes = res.clone()

          let base64Body = ''

          if (process.env.NEXT_RUNTIME === 'edge') {
            let string = ''
            new Uint8Array(await clonedRes.arrayBuffer()).forEach((byte) => {
              string += String.fromCharCode(byte)
            })
            base64Body = btoa(string)
          } else {
            base64Body = Buffer.from(await clonedRes.arrayBuffer()).toString(
              'base64'
            )
          }

          await staticGenerationStore.incrementalCache.set(
            cacheKey,
            {
              kind: 'FETCH',
              isStale: false,
              age: 0,
              data: {
                headers: Object.fromEntries(clonedRes.headers.entries()),
                body: base64Body,
              },
              revalidate,
            },
            revalidate,
            true
          )
        }
        return res
      })
    }

    if (
      staticGenerationStore.incrementalCache &&
      typeof revalidate === 'number' &&
      revalidate > 0
    ) {
      cacheKey = await staticGenerationStore.incrementalCache.fetchCacheKey(
        input.toString(),
        init
      )
      const entry = await staticGenerationStore.incrementalCache.get(
        cacheKey,
        true
      )

      if (entry?.value && entry.value.kind === 'FETCH') {
        // when stale and is revalidating we wait for fresh data
        // so the revalidated entry has the updated data
        if (!staticGenerationStore.isRevalidate || !entry.isStale) {
          if (entry.isStale) {
            if (!staticGenerationStore.pendingRevalidates) {
              staticGenerationStore.pendingRevalidates = []
            }
            staticGenerationStore.pendingRevalidates.push(
              doOriginalFetch().catch(console.error)
            )
          }

          const resData = entry.value.data
          let decodedBody = ''

          // TODO: handle non-text response bodies
          if (process.env.NEXT_RUNTIME === 'edge') {
            decodedBody = atob(resData.body)
          } else {
            decodedBody = Buffer.from(resData.body, 'base64').toString()
          }

          return new Response(decodedBody, {
            headers: resData.headers,
            status: resData.status,
          })
        }
      }
    }

    if (staticGenerationStore.isStaticGeneration) {
      if (init && typeof init === 'object') {
        const cache = init.cache
        // Delete `cache` property as Cloudflare Workers will throw an error
        if (isEdgeRuntime) {
          delete init.cache
        }
        if (cache === 'no-store') {
          staticGenerationStore.revalidate = 0
          // TODO: ensure this error isn't logged to the user
          // seems it's slipping through currently
          const dynamicUsageReason = `no-store fetch ${input}${
            staticGenerationStore.pathname
              ? ` ${staticGenerationStore.pathname}`
              : ''
          }`
          const err = new DynamicServerError(dynamicUsageReason)
          staticGenerationStore.dynamicUsageStack = err.stack
          staticGenerationStore.dynamicUsageDescription = dynamicUsageReason

          throw err
        }

        const hasNextConfig = 'next' in init
        const next = init.next || {}
        if (
          typeof next.revalidate === 'number' &&
          (typeof staticGenerationStore.revalidate === 'undefined' ||
            next.revalidate < staticGenerationStore.revalidate)
        ) {
          const forceDynamic = staticGenerationStore.forceDynamic

          if (!forceDynamic || next.revalidate !== 0) {
            staticGenerationStore.revalidate = next.revalidate
          }

          if (!forceDynamic && next.revalidate === 0) {
            const dynamicUsageReason = `revalidate: ${
              next.revalidate
            } fetch ${input}${
              staticGenerationStore.pathname
                ? ` ${staticGenerationStore.pathname}`
                : ''
            }`
            const err = new DynamicServerError(dynamicUsageReason)
            staticGenerationStore.dynamicUsageStack = err.stack
            staticGenerationStore.dynamicUsageDescription = dynamicUsageReason

            throw err
          }
        }
        if (hasNextConfig) delete init.next
      }
    }

    return doOriginalFetch()
  }
}

interface FlightResponseRef {
  current: Promise<JSX.Element> | null
}

/**
 * Render Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
function useFlightResponse(
  writable: WritableStream<Uint8Array>,
  req: ReadableStream<Uint8Array>,
  serverComponentManifest: any,
  rscChunks: Uint8Array[],
  flightResponseRef: FlightResponseRef,
  nonce?: string
): Promise<JSX.Element> {
  if (flightResponseRef.current !== null) {
    return flightResponseRef.current
  }
  const {
    createFromReadableStream,
  } = require('next/dist/compiled/react-server-dom-webpack/client')

  const [renderStream, forwardStream] = readableStreamTee(req)
  const res = createFromReadableStream(renderStream, {
    moduleMap: isEdgeRuntime
      ? serverComponentManifest.__edge_ssr_module_mapping__
      : serverComponentManifest.__ssr_module_mapping__,
  })
  flightResponseRef.current = res

  let bootstrapped = false
  // We only attach CSS chunks to the inlined data.
  const forwardReader = forwardStream.getReader()
  const writer = writable.getWriter()
  const startScriptTag = nonce
    ? `<script nonce=${JSON.stringify(nonce)}>`
    : '<script>'

  function read() {
    forwardReader.read().then(({ done, value }) => {
      if (value) {
        rscChunks.push(value)
      }

      if (!bootstrapped) {
        bootstrapped = true
        writer.write(
          encodeText(
            `${startScriptTag}(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
              JSON.stringify([0])
            )})</script>`
          )
        )
      }
      if (done) {
        flightResponseRef.current = null
        writer.close()
      } else {
        const responsePartial = decodeText(value)
        const scripts = `${startScriptTag}self.__next_f.push(${htmlEscapeJsonString(
          JSON.stringify([1, responsePartial])
        )})</script>`

        writer.write(encodeText(scripts))
        read()
      }
    })
  }
  read()

  return res
}

/**
 * Create a component that renders the Flight stream.
 * This is only used for renderToHTML, the Flight response does not need additional wrappers.
 */
function createServerComponentRenderer(
  ComponentToRender: any,
  ComponentMod: {
    renderToReadableStream: any
    __next_app_webpack_require__?: any
  },
  {
    transformStream,
    serverComponentManifest,
    serverContexts,
    rscChunks,
  }: {
    transformStream: TransformStream<Uint8Array, Uint8Array>
    serverComponentManifest: NonNullable<RenderOpts['serverComponentManifest']>
    serverContexts: Array<
      [ServerContextName: string, JSONValue: Object | number | string]
    >
    rscChunks: Uint8Array[]
  },
  serverComponentsErrorHandler: ReturnType<typeof createErrorHandler>,
  nonce?: string
): () => JSX.Element {
  // We need to expose the `__webpack_require__` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  if (ComponentMod.__next_app_webpack_require__) {
    // @ts-ignore
    globalThis.__next_require__ = ComponentMod.__next_app_webpack_require__

    // @ts-ignore
    globalThis.__next_chunk_load__ = () => Promise.resolve()
  }

  let RSCStream: ReadableStream<Uint8Array>
  const createRSCStream = () => {
    if (!RSCStream) {
      RSCStream = ComponentMod.renderToReadableStream(
        <ComponentToRender />,
        serverComponentManifest,
        {
          context: serverContexts,
          onError: serverComponentsErrorHandler,
        }
      )
    }
    return RSCStream
  }

  const flightResponseRef: FlightResponseRef = { current: null }

  const writable = transformStream.writable
  return function ServerComponentWrapper(): JSX.Element {
    const reqStream = createRSCStream()
    const response = useFlightResponse(
      writable,
      reqStream,
      serverComponentManifest,
      rscChunks,
      flightResponseRef,
      nonce
    )
    return use(response)
  }
}

type DynamicParamTypes = 'catchall' | 'optional-catchall' | 'dynamic'
// c = catchall
// oc = optional catchall
// d = dynamic
export type DynamicParamTypesShort = 'c' | 'oc' | 'd'

/**
 * Shorten the dynamic param in order to make it smaller when transmitted to the browser.
 */
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

/**
 * Segment in the router state.
 */
export type Segment =
  | string
  | [param: string, value: string, type: DynamicParamTypesShort]

/**
 * LoaderTree is generated in next-app-loader.
 */
type LoaderTree = [
  segment: string,
  parallelRoutes: { [parallelRouterKey: string]: LoaderTree },
  components: ComponentsType
]

/**
 * Router state
 */
export type FlightRouterState = [
  segment: Segment,
  parallelRoutes: { [parallelRouterKey: string]: FlightRouterState },
  url?: string,
  refresh?: 'refetch',
  isRootLayout?: boolean
]

/**
 * Individual Flight response path
 */
export type FlightSegmentPath =
  // Uses `any` as repeating pattern can't be typed.
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
  // Uses `any` as repeating pattern can't be typed.
  | any[]
  // Looks somewhat like this
  | [
      // Holds full path to the segment.
      ...FlightSegmentPath[],
      /* segment of the rendered slice: */ Segment,
      /* treePatch */ FlightRouterState,
      /* subTreeData: */ React.ReactNode | null, // Can be null during prefetch if there's no loading component
      /* head */ React.ReactNode | null
    ]

/**
 * The Flight response data
 */
export type FlightData = Array<FlightDataPath> | string

/**
 * Property holding the current subTreeData.
 */
export type ChildProp = {
  /**
   * Null indicates that the tree is partial
   */
  current: React.ReactNode | null
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
 * Get inline <link> tags based on server CSS manifest. Only used when rendering to HTML.
 */
function getCssInlinedLinkTags(
  serverComponentManifest: FlightManifest,
  serverCSSManifest: FlightCSSManifest,
  filePath: string,
  serverCSSForEntries: string[],
  injectedCSS: Set<string>,
  collectNewCSSImports?: boolean
): string[] {
  const layoutOrPageCssModules = serverCSSManifest[filePath]

  const filePathWithoutExt = filePath.replace(/\.[^.]+$/, '')
  const cssFilesForEntry = new Set(
    serverComponentManifest.__entry_css_files__?.[filePathWithoutExt] || []
  )

  if (!layoutOrPageCssModules || !cssFilesForEntry.size) {
    return []
  }
  const chunks = new Set<string>()

  for (const mod of layoutOrPageCssModules) {
    // We only include the CSS if it's a global CSS, or it is used by this
    // entrypoint.
    if (
      serverCSSForEntries.includes(mod) ||
      !/\.module\.(css|sass|scss)$/.test(mod)
    ) {
      // If the CSS is already injected by a parent layer, we don't need
      // to inject it again.
      if (!injectedCSS.has(mod)) {
        const modData = serverComponentManifest[mod]
        if (modData) {
          for (const chunk of modData.default.chunks) {
            // If the current entry in the final tree-shaked bundle has that CSS
            // chunk, it means that it's actually used. We should include it.
            if (cssFilesForEntry.has(chunk)) {
              chunks.add(chunk)
              // This might be a new layout, and to make it more efficient and
              // not introducing another loop, we mutate the set directly.
              if (collectNewCSSImports) {
                injectedCSS.add(mod)
              }
            }
          }
        }
      }
    }
  }

  return [...chunks]
}

function getServerCSSForEntries(
  serverCSSManifest: FlightCSSManifest,
  entries: string[]
) {
  const css = []
  for (const entry of entries) {
    const entryName = entry.replace(/\.[^.]+$/, '')
    if (
      serverCSSManifest.__entry_css_mods__ &&
      serverCSSManifest.__entry_css_mods__[entryName]
    ) {
      css.push(...serverCSSManifest.__entry_css_mods__[entryName])
    }
  }
  return css
}

/**
 * Get inline <link rel="preload" as="font"> tags based on server CSS manifest and font loader manifest. Only used when rendering to HTML.
 */
function getPreloadedFontFilesInlineLinkTags(
  serverComponentManifest: FlightManifest,
  serverCSSManifest: FlightCSSManifest,
  fontLoaderManifest: FontLoaderManifest | undefined,
  serverCSSForEntries: string[],
  filePath?: string
): string[] | null {
  if (!fontLoaderManifest || !filePath) {
    return null
  }
  const layoutOrPageCss =
    serverCSSManifest[filePath] ||
    serverComponentManifest.__client_css_manifest__?.[filePath]

  if (!layoutOrPageCss) {
    return null
  }

  const fontFiles = new Set<string>()
  // If we find an entry in the manifest but it's empty, add a preconnect tag
  let foundFontUsage = false

  for (const css of layoutOrPageCss) {
    // We only include the CSS if it is used by this entrypoint.
    if (serverCSSForEntries.includes(css)) {
      const preloadedFontFiles = fontLoaderManifest.app[css]
      if (preloadedFontFiles) {
        foundFontUsage = true
        for (const fontFile of preloadedFontFiles) {
          fontFiles.add(fontFile)
        }
      }
    }
  }

  if (!foundFontUsage) {
    return null
  }

  return [...fontFiles]
}

function getScriptNonceFromHeader(cspHeaderValue: string): string | undefined {
  const directives = cspHeaderValue
    // Directives are split by ';'.
    .split(';')
    .map((directive) => directive.trim())

  // First try to find the directive for the 'script-src', otherwise try to
  // fallback to the 'default-src'.
  const directive =
    directives.find((dir) => dir.startsWith('script-src')) ||
    directives.find((dir) => dir.startsWith('default-src'))

  // If no directive could be found, then we're done.
  if (!directive) {
    return
  }

  // Extract the nonce from the directive
  const nonce = directive
    .split(' ')
    // Remove the 'strict-src'/'default-src' string, this can't be the nonce.
    .slice(1)
    .map((source) => source.trim())
    // Find the first source with the 'nonce-' prefix.
    .find(
      (source) =>
        source.startsWith("'nonce-") &&
        source.length > 8 &&
        source.endsWith("'")
    )
    // Grab the nonce by trimming the 'nonce-' prefix.
    ?.slice(7, -1)

  // If we could't find the nonce, then we're done.
  if (!nonce) {
    return
  }

  // Don't accept the nonce value if it contains HTML escape characters.
  // Technically, the spec requires a base64'd value, but this is just an
  // extra layer.
  if (ESCAPE_REGEX.test(nonce)) {
    throw new Error(
      'Nonce value from Content-Security-Policy contained HTML escape characters.\nLearn more: https://nextjs.org/docs/messages/nonce-contained-invalid-characters'
    )
  }

  return nonce
}

async function renderToString(element: React.ReactElement) {
  const renderStream = await ReactDOMServer.renderToReadableStream(element)
  await renderStream.allReady
  return streamToString(renderStream)
}

export async function renderToHTMLOrFlight(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts
): Promise<RenderResult | null> {
  const isFlight = req.headers[RSC.toLowerCase()] !== undefined

  const capturedErrors: Error[] = []
  const allCapturedErrors: Error[] = []

  const isNextExport = !!renderOpts.nextExport
  const serverComponentsErrorHandler = createErrorHandler(
    'serverComponentsRenderer',
    isNextExport,
    capturedErrors
  )
  const flightDataRendererErrorHandler = createErrorHandler(
    'flightDataRenderer',
    isNextExport,
    capturedErrors
  )
  const htmlRendererErrorHandler = createErrorHandler(
    'htmlRenderer',
    isNextExport,
    capturedErrors,
    allCapturedErrors
  )

  const {
    buildManifest,
    subresourceIntegrityManifest,
    serverComponentManifest,
    serverCSSManifest = {},
    ComponentMod,
    dev,
    fontLoaderManifest,
    supportsDynamicHTML,
  } = renderOpts

  patchFetch(ComponentMod)
  const generateStaticHTML = supportsDynamicHTML !== true

  const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
    ComponentMod.staticGenerationAsyncStorage
  const requestAsyncStorage: RequestAsyncStorage =
    ComponentMod.requestAsyncStorage

  // we wrap the render in an AsyncLocalStorage context
  const wrappedRender = async () => {
    const staticGenerationStore = staticGenerationAsyncStorage.getStore()
    if (!staticGenerationStore) {
      throw new Error(
        `Invariant: Render expects to have staticGenerationAsyncStorage, none found`
      )
    }

    // don't modify original query object
    query = Object.assign({}, query)

    const isPrefetch =
      req.headers[NEXT_ROUTER_PREFETCH.toLowerCase()] !== undefined

    // TODO-APP: verify the tree is valid
    // TODO-APP: verify query param is single value (not an array)
    // TODO-APP: verify tree can't grow out of control
    /**
     * Router state provided from the client-side router. Used to handle rendering from the common layout down.
     */
    let providedFlightRouterState: FlightRouterState = isFlight
      ? req.headers[NEXT_ROUTER_STATE_TREE.toLowerCase()]
        ? JSON.parse(
            req.headers[NEXT_ROUTER_STATE_TREE.toLowerCase()] as string
          )
        : undefined
      : undefined

    /**
     * The tree created in next-app-loader that holds component segments and modules
     */
    const loaderTree: LoaderTree = ComponentMod.tree

    /**
     * The metadata items array created in next-app-loader with all relevant information
     * that we need to resolve the final metadata.
     */
    const metadataItems = ComponentMod.metadata

    stripInternalQueries(query)

    const LayoutRouter =
      ComponentMod.LayoutRouter as typeof import('../client/components/layout-router').default
    const RenderFromTemplateContext =
      ComponentMod.RenderFromTemplateContext as typeof import('../client/components/render-from-template-context').default

    /**
     * Server Context is specifically only available in Server Components.
     * It has to hold values that can't change while rendering from the common layout down.
     * An example of this would be that `headers` are available but `searchParams` are not because that'd mean we have to render from the root layout down on all requests.
     */

    const serverContexts: Array<[string, any]> = [
      ['WORKAROUND', null], // TODO-APP: First value has a bug currently where the value is not set on the second request: https://github.com/facebook/react/issues/24849
    ]

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
      let value = pathParams[key]

      if (Array.isArray(value)) {
        value = value.map((i) => encodeURIComponent(i))
      } else if (typeof value === 'string') {
        value = encodeURIComponent(value)
      }

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
        treeSegment: [
          key,
          Array.isArray(value) ? value.join('/') : value,
          type,
        ],
        type: type,
      }
    }

    async function resolveHead(
      [segment, parallelRoutes, { head }]: LoaderTree,
      parentParams: { [key: string]: any }
    ): Promise<React.ReactNode> {
      // Handle dynamic segment params.
      const segmentParam = getDynamicParamFromSegment(segment)
      /**
       * Create object holding the parent params and current params
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
      for (const key in parallelRoutes) {
        const childTree = parallelRoutes[key]
        const returnedHead = await resolveHead(childTree, currentParams)
        if (returnedHead) {
          return returnedHead
        }
      }

      if (head) {
        const Head = await interopDefault(await head[0]())
        return <Head params={currentParams} />
      }

      return null
    }

    const createFlightRouterStateFromLoaderTree = (
      [segment, parallelRoutes, { layout }]: LoaderTree,
      rootLayoutIncluded = false
    ): FlightRouterState => {
      const dynamicParam = getDynamicParamFromSegment(segment)

      const segmentTree: FlightRouterState = [
        dynamicParam ? dynamicParam.treeSegment : segment,
        {},
      ]

      if (!rootLayoutIncluded && typeof layout !== 'undefined') {
        rootLayoutIncluded = true
        segmentTree[4] = true
      }

      segmentTree[1] = Object.keys(parallelRoutes).reduce(
        (existingValue, currentValue) => {
          existingValue[currentValue] = createFlightRouterStateFromLoaderTree(
            parallelRoutes[currentValue],
            rootLayoutIncluded
          )
          return existingValue
        },
        {} as FlightRouterState[1]
      )

      return segmentTree
    }

    let defaultRevalidate: false | undefined | number = false

    // Collect all server CSS imports used by this specific entry (or entries, for parallel routes).
    // Not that we can't rely on the CSS manifest because it tracks CSS imports per module,
    // which can be used by multiple entries and cannot be tree-shaked in the module graph.
    // More info: https://github.com/vercel/next.js/issues/41018
    const serverCSSForEntries = getServerCSSForEntries(
      serverCSSManifest!,
      ComponentMod.pages
    )

    const assetPrefix = renderOpts.assetPrefix || ''

    const createComponentAndStyles = async ({
      filePath,
      getComponent,
      shouldPreload,
      injectedCSS,
    }: {
      filePath: string
      getComponent: () => any
      shouldPreload?: boolean
      injectedCSS: Set<string>
    }): Promise<any> => {
      const cssHrefs = getCssInlinedLinkTags(
        serverComponentManifest,
        serverCSSManifest,
        filePath,
        serverCSSForEntries,
        injectedCSS
      )

      const styles = cssHrefs
        ? cssHrefs.map((href, index) => (
            <link
              rel="stylesheet"
              // In dev, Safari will wrongly cache the resource if you preload it:
              // - https://github.com/vercel/next.js/issues/5860
              // - https://bugs.webkit.org/show_bug.cgi?id=187726
              // We used to add a `?ts=` query for resources in `pages` to bypass it,
              // but in this case it is fine as we don't need to preload the styles.
              href={`${assetPrefix}/_next/${href}`}
              // @ts-ignore
              precedence={shouldPreload ? 'high' : undefined}
              key={index}
            />
          ))
        : null
      const Comp = await interopDefault(await getComponent())

      return [Comp, styles]
    }

    /**
     * Use the provided loader tree to create the React Component tree.
     */
    const createComponentTree = async ({
      createSegmentPath,
      loaderTree: [
        segment,
        parallelRoutes,
        { layout, template, error, loading, page, 'not-found': notFound },
      ],
      parentParams,
      firstItem,
      rootLayoutIncluded,
      injectedCSS,
    }: {
      createSegmentPath: CreateSegmentPath
      loaderTree: LoaderTree
      parentParams: { [key: string]: any }
      rootLayoutIncluded: boolean
      firstItem?: boolean
      injectedCSS: Set<string>
    }): Promise<{ Component: React.ComponentType }> => {
      const layoutOrPagePath = layout?.[1] || page?.[1]

      const injectedCSSWithCurrentLayout = new Set(injectedCSS)
      const stylesheets: string[] = layoutOrPagePath
        ? getCssInlinedLinkTags(
            serverComponentManifest,
            serverCSSManifest!,
            layoutOrPagePath,
            serverCSSForEntries,
            injectedCSSWithCurrentLayout,
            true
          )
        : []

      const preloadedFontFiles = layoutOrPagePath
        ? getPreloadedFontFilesInlineLinkTags(
            serverComponentManifest,
            serverCSSManifest!,
            fontLoaderManifest,
            serverCSSForEntries,
            layoutOrPagePath
          )
        : []

      const [Template, templateStyles] = template
        ? await createComponentAndStyles({
            filePath: template[1],
            getComponent: template[0],
            shouldPreload: true,
            injectedCSS: injectedCSSWithCurrentLayout,
          })
        : [React.Fragment]

      const [ErrorComponent, errorStyles] = error
        ? await createComponentAndStyles({
            filePath: error[1],
            getComponent: error[0],
            injectedCSS: injectedCSSWithCurrentLayout,
          })
        : []

      const [Loading, loadingStyles] = loading
        ? await createComponentAndStyles({
            filePath: loading[1],
            getComponent: loading[0],
            injectedCSS: injectedCSSWithCurrentLayout,
          })
        : []

      const isLayout = typeof layout !== 'undefined'
      const isPage = typeof page !== 'undefined'
      const layoutOrPageMod = isLayout
        ? await layout[0]()
        : isPage
        ? await page[0]()
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

      const [NotFound, notFoundStyles] = notFound
        ? await createComponentAndStyles({
            filePath: notFound[1],
            getComponent: notFound[0],
            injectedCSS: injectedCSSWithCurrentLayout,
          })
        : rootLayoutAtThisLevel
        ? [DefaultNotFound]
        : []

      if (typeof layoutOrPageMod?.dynamic === 'string') {
        // the nested most config wins so we only force-static
        // if it's configured above any parent that configured
        // otherwise
        if (layoutOrPageMod.dynamic === 'force-static') {
          staticGenerationStore.forceStatic = true
        } else if (layoutOrPageMod.dynamic !== 'error') {
          staticGenerationStore.forceStatic = false
        }
      }

      if (typeof layoutOrPageMod?.revalidate === 'number') {
        defaultRevalidate = layoutOrPageMod.revalidate

        if (
          staticGenerationStore.isStaticGeneration &&
          defaultRevalidate === 0
        ) {
          const { DynamicServerError } =
            ComponentMod.serverHooks as typeof import('../client/components/hooks-server-context')

          const dynamicUsageDescription = `revalidate: 0 configured ${segment}`
          staticGenerationStore.dynamicUsageDescription =
            dynamicUsageDescription

          throw new DynamicServerError(dynamicUsageDescription)
        }
      }

      /**
       * The React Component to render.
       */
      let Component = layoutOrPageMod
        ? interopDefault(layoutOrPageMod)
        : undefined

      if (dev) {
        const { isValidElementType } = require('next/dist/compiled/react-is')
        if (
          (isPage || typeof Component !== 'undefined') &&
          !isValidElementType(Component)
        ) {
          throw new Error(
            `The default export is not a React Component in page: "${pathname}"`
          )
        }

        if (
          typeof ErrorComponent !== 'undefined' &&
          !isValidElementType(ErrorComponent)
        ) {
          throw new Error(
            `The default export of error is not a React Component in page: ${segment}`
          )
        }

        if (typeof Loading !== 'undefined' && !isValidElementType(Loading)) {
          throw new Error(
            `The default export of loading is not a React Component in ${segment}`
          )
        }

        if (typeof NotFound !== 'undefined' && !isValidElementType(NotFound)) {
          throw new Error(
            `The default export of notFound is not a React Component in ${segment}`
          )
        }
      }

      // Handle dynamic segment params.
      const segmentParam = getDynamicParamFromSegment(segment)
      /**
       * Create object holding the parent params and current params
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

            const childSegment = parallelRoutes[parallelRouteKey][0]
            const childSegmentParam = getDynamicParamFromSegment(childSegment)

            if (isPrefetch && Loading) {
              const childProp: ChildProp = {
                // Null indicates the tree is not fully rendered
                current: null,
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
                  loadingStyles={loadingStyles}
                  hasLoading={Boolean(Loading)}
                  error={ErrorComponent}
                  errorStyles={errorStyles}
                  template={
                    <Template>
                      <RenderFromTemplateContext />
                    </Template>
                  }
                  templateStyles={templateStyles}
                  notFound={NotFound ? <NotFound /> : undefined}
                  notFoundStyles={notFoundStyles}
                  childProp={childProp}
                />,
              ]
            }

            // Create the child component
            const { Component: ChildComponent } = await createComponentTree({
              createSegmentPath: (child) => {
                return createSegmentPath([...currentSegmentPath, ...child])
              },
              loaderTree: parallelRoutes[parallelRouteKey],
              parentParams: currentParams,
              rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
              injectedCSS: injectedCSSWithCurrentLayout,
            })

            const childProp: ChildProp = {
              current: <ChildComponent />,
              segment: childSegmentParam
                ? childSegmentParam.treeSegment
                : childSegment,
            }

            const segmentPath = createSegmentPath(currentSegmentPath)

            // This is turned back into an object below.
            return [
              parallelRouteKey,
              <LayoutRouter
                parallelRouterKey={parallelRouteKey}
                segmentPath={segmentPath}
                error={ErrorComponent}
                errorStyles={errorStyles}
                loading={Loading ? <Loading /> : undefined}
                loadingStyles={loadingStyles}
                // TODO-APP: Add test for loading returning `undefined`. This currently can't be tested as the `webdriver()` tab will wait for the full page to load before returning.
                hasLoading={Boolean(Loading)}
                template={
                  <Template>
                    <RenderFromTemplateContext />
                  </Template>
                }
                templateStyles={templateStyles}
                notFound={NotFound ? <NotFound /> : undefined}
                notFoundStyles={notFoundStyles}
                childProp={childProp}
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

      const props = {
        ...parallelRouteComponents,
        // TODO-APP: params and query have to be blocked parallel route names. Might have to add a reserved name list.
        // Params are always the current params that apply to the layout
        // If you have a `/dashboard/[team]/layout.js` it will provide `team` as a param but not anything further down.
        params: currentParams,
        // Query is only provided to page
        ...(isPage ? { searchParams: query } : {}),
      }

      // Eagerly execute layout/page component to trigger fetches early.
      Component = await Promise.resolve().then(() => {
        return preloadComponent(Component, props)
      })

      return {
        Component: () => {
          return (
            <>
              {preloadedFontFiles?.length === 0 ? (
                <link rel="preconnect" href="/" crossOrigin="anonymous" />
              ) : null}
              {preloadedFontFiles
                ? preloadedFontFiles.map((fontFile) => {
                    const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(fontFile)![1]
                    return (
                      <link
                        key={fontFile}
                        rel="preload"
                        href={`${assetPrefix}/_next/${fontFile}`}
                        as="font"
                        type={`font/${ext}`}
                        crossOrigin="anonymous"
                      />
                    )
                  })
                : null}
              {stylesheets
                ? stylesheets.map((href, index) => (
                    <link
                      rel="stylesheet"
                      // In dev, Safari will wrongly cache the resource if you preload it:
                      // - https://github.com/vercel/next.js/issues/5860
                      // - https://bugs.webkit.org/show_bug.cgi?id=187726
                      // We used to add a `?ts=` query for resources in `pages` to bypass it,
                      // but in this case it is fine as we don't need to preload the styles.
                      href={`${assetPrefix}/_next/${href}`}
                      // `Precedence` is an opt-in signal for React to handle
                      // resource loading and deduplication, etc:
                      // https://github.com/facebook/react/pull/25060
                      // @ts-ignore
                      precedence="high"
                      key={index}
                    />
                  ))
                : null}
              <Component {...props} />
            </>
          )
        },
      }
    }

    const streamToBufferedResult = async (
      renderResult: RenderResult
    ): Promise<string> => {
      const renderChunks: Buffer[] = []
      const writable = new Writable({
        write(chunk, _encoding, callback) {
          renderChunks.push(chunk)
          callback()
        },
      })
      await renderResult.pipe(writable)
      return Buffer.concat(renderChunks).toString()
    }

    // Handle Flight render request. This is only used when client-side navigating. E.g. when you `router.push('/dashboard')` or `router.reload()`.
    const generateFlight = async (): Promise<RenderResult> => {
      // TODO-APP: throw on invalid flightRouterState
      /**
       * Use router state to decide at what common layout to render the page.
       * This can either be the common layout between two pages or a specific place to start rendering from using the "refetch" marker in the tree.
       */
      const walkTreeWithFlightRouterState = async ({
        createSegmentPath,
        loaderTreeToFilter,
        parentParams,
        isFirst,
        flightRouterState,
        parentRendered,
        rscPayloadHead,
        injectedCSS,
        rootLayoutIncluded,
      }: {
        createSegmentPath: CreateSegmentPath
        loaderTreeToFilter: LoaderTree
        parentParams: { [key: string]: string | string[] }
        isFirst: boolean
        flightRouterState?: FlightRouterState
        parentRendered?: boolean
        rscPayloadHead: React.ReactNode
        injectedCSS: Set<string>
        rootLayoutIncluded: boolean
      }): Promise<FlightDataPath> => {
        const [segment, parallelRoutes, { layout }] = loaderTreeToFilter
        const isLayout = typeof layout !== 'undefined'
        const parallelRoutesKeys = Object.keys(parallelRoutes)

        /**
         * Checks if the current segment is a root layout.
         */
        const rootLayoutAtThisLevel = isLayout && !rootLayoutIncluded
        /**
         * Checks if the current segment or any level above it has a root layout.
         */
        const rootLayoutIncludedAtThisLevelOrAbove =
          rootLayoutIncluded || rootLayoutAtThisLevel

        // Because this function walks to a deeper point in the tree to start rendering we have to track the dynamic parameters up to the point where rendering starts
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
            // Check if one level down from the common layout has a loading component. If it doesn't only provide the router state as part of the Flight data.
            isPrefetch && !Boolean(loaderTreeToFilter[2].loading)
              ? null
              : // Create component tree using the slice of the loaderTree
                // @ts-expect-error TODO-APP: fix async component type
                React.createElement(async () => {
                  const { Component } = await createComponentTree(
                    // This ensures flightRouterPath is valid and filters down the tree
                    {
                      createSegmentPath: (child) => {
                        return createSegmentPath(child)
                      },
                      loaderTree: loaderTreeToFilter,
                      parentParams: currentParams,
                      firstItem: isFirst,
                      injectedCSS,
                      // This is intentionally not "rootLayoutIncludedAtThisLevelOrAbove" as createComponentTree starts at the current level and does a check for "rootLayoutAtThisLevel" too.
                      rootLayoutIncluded: rootLayoutIncluded,
                    }
                  )
                  return <Component />
                }),
            isPrefetch && !Boolean(loaderTreeToFilter[2].loading) ? null : (
              <>{rscPayloadHead}</>
            ),
          ]
        }

        // If we are not rendering on this level we need to check if the current
        // segment has a layout. If so, we need to track all the used CSS to make
        // the result consistent.
        const layoutPath = layout?.[1]
        const injectedCSSWithCurrentLayout = new Set(injectedCSS)
        if (layoutPath) {
          getCssInlinedLinkTags(
            serverComponentManifest,
            serverCSSManifest!,
            layoutPath,
            serverCSSForEntries,
            injectedCSSWithCurrentLayout,
            true
          )
        }

        // Walk through all parallel routes.
        for (const parallelRouteKey of parallelRoutesKeys) {
          const parallelRoute = parallelRoutes[parallelRouteKey]

          const currentSegmentPath: FlightSegmentPath = isFirst
            ? [parallelRouteKey]
            : [actualSegment, parallelRouteKey]

          const path = await walkTreeWithFlightRouterState({
            createSegmentPath: (child) => {
              return createSegmentPath([...currentSegmentPath, ...child])
            },
            loaderTreeToFilter: parallelRoute,
            parentParams: currentParams,
            flightRouterState:
              flightRouterState && flightRouterState[1][parallelRouteKey],
            parentRendered: parentRendered || renderComponentsOnThisLevel,
            isFirst: false,
            rscPayloadHead,
            injectedCSS: injectedCSSWithCurrentLayout,
            rootLayoutIncluded: rootLayoutIncludedAtThisLevelOrAbove,
          })

          if (typeof path[path.length - 1] !== 'string') {
            return [actualSegment, parallelRouteKey, ...path]
          }
        }

        return [actualSegment]
      }

      const rscPayloadHead = await resolveHead(loaderTree, {})
      // Flight data that is going to be passed to the browser.
      // Currently a single item array but in the future multiple patches might be combined in a single request.
      const flightData: FlightData = [
        (
          await walkTreeWithFlightRouterState({
            createSegmentPath: (child) => child,
            loaderTreeToFilter: loaderTree,
            parentParams: {},
            flightRouterState: providedFlightRouterState,
            isFirst: true,
            rscPayloadHead: (
              <>
                {/* @ts-expect-error allow to use async server component */}
                <Metadata metadata={metadataItems} />
                {rscPayloadHead}
              </>
            ),
            injectedCSS: new Set(),
            rootLayoutIncluded: false,
          })
        ).slice(1),
      ]

      // For app dir, use the bundled version of Fizz renderer (renderToReadableStream)
      // which contains the subset React.
      const readable = ComponentMod.renderToReadableStream(
        flightData,
        serverComponentManifest,
        {
          context: serverContexts,
          onError: flightDataRendererErrorHandler,
        }
      ).pipeThrough(createBufferedTransformStream())

      return new FlightRenderResult(readable)
    }

    if (isFlight && !staticGenerationStore.isStaticGeneration) {
      return generateFlight()
    }

    // Below this line is handling for rendering to HTML.

    // AppRouter is provided by next-app-loader
    const AppRouter =
      ComponentMod.AppRouter as typeof import('../client/components/app-router').default

    const GlobalError = interopDefault(
      /** GlobalError can be either the default error boundary or the overwritten app/global-error.js **/
      ComponentMod.GlobalError as typeof import('../client/components/error-boundary').default
    )

    let serverComponentsInlinedTransformStream: TransformStream<
      Uint8Array,
      Uint8Array
    > = new TransformStream()

    // TODO-APP: validate req.url as it gets passed to render.
    const initialCanonicalUrl = req.url!

    // Get the nonce from the incoming request if it has one.
    const csp = req.headers['content-security-policy']
    let nonce: string | undefined
    if (csp && typeof csp === 'string') {
      nonce = getScriptNonceFromHeader(csp)
    }

    const serverComponentsRenderOpts = {
      transformStream: serverComponentsInlinedTransformStream,
      serverComponentManifest,
      serverContexts,
      rscChunks: [],
    }

    const validateRootLayout = dev
      ? {
          validateRootLayout: {
            assetPrefix: renderOpts.assetPrefix,
            getTree: () => createFlightRouterStateFromLoaderTree(loaderTree),
          },
        }
      : {}

    const initialHead = await resolveHead(loaderTree, {})

    /**
     * A new React Component that renders the provided React Component
     * using Flight which can then be rendered to HTML.
     */
    const ServerComponentsRenderer = createServerComponentRenderer(
      async () => {
        // Create full component tree from root to leaf.
        const { Component: ComponentTree } = await createComponentTree({
          createSegmentPath: (child) => child,
          loaderTree: loaderTree,
          parentParams: {},
          firstItem: true,
          injectedCSS: new Set(),
          rootLayoutIncluded: false,
        })

        const initialTree = createFlightRouterStateFromLoaderTree(loaderTree)

        return (
          <>
            <AppRouter
              assetPrefix={assetPrefix}
              initialCanonicalUrl={initialCanonicalUrl}
              initialTree={initialTree}
              initialHead={
                <>
                  {/* @ts-expect-error allow to use async server component */}
                  <Metadata metadata={metadataItems} />
                  {initialHead}
                </>
              }
              globalErrorComponent={GlobalError}
            >
              <ComponentTree />
            </AppRouter>
          </>
        )
      },
      ComponentMod,
      serverComponentsRenderOpts,
      serverComponentsErrorHandler,
      nonce
    )

    const serverInsertedHTMLCallbacks: Set<() => React.ReactNode> = new Set()
    function InsertedHTML({ children }: { children: JSX.Element }) {
      // Reset addInsertedHtmlCallback on each render
      serverInsertedHTMLCallbacks.clear()
      const addInsertedHtml = React.useCallback(
        (handler: () => React.ReactNode) => {
          serverInsertedHTMLCallbacks.add(handler)
        },
        []
      )

      return (
        <HeadManagerContext.Provider
          value={{
            appDir: true,
            nonce,
          }}
        >
          <ServerInsertedHTMLContext.Provider value={addInsertedHtml}>
            {children}
          </ServerInsertedHTMLContext.Provider>
        </HeadManagerContext.Provider>
      )
    }

    const bodyResult = async () => {
      const polyfills = buildManifest.polyfillFiles
        .filter(
          (polyfill) =>
            polyfill.endsWith('.js') && !polyfill.endsWith('.module.js')
        )
        .map((polyfill) => ({
          src: `${assetPrefix}/_next/${polyfill}`,
          integrity: subresourceIntegrityManifest?.[polyfill],
        }))

      const content = (
        <InsertedHTML>
          <ServerComponentsRenderer />
        </InsertedHTML>
      )

      let polyfillsFlushed = false
      const getServerInsertedHTML = (): Promise<string> => {
        const flushed = renderToString(
          <>
            {Array.from(serverInsertedHTMLCallbacks).map((callback) =>
              callback()
            )}
            {polyfillsFlushed
              ? null
              : polyfills?.map((polyfill) => {
                  return (
                    <script
                      key={polyfill.src}
                      src={polyfill.src}
                      integrity={polyfill.integrity}
                      noModule={true}
                      nonce={nonce}
                    />
                  )
                })}
          </>
        )
        polyfillsFlushed = true
        return flushed
      }

      try {
        const renderStream = await renderToInitialStream({
          ReactDOMServer,
          element: content,
          streamOptions: {
            onError: htmlRendererErrorHandler,
            nonce,
            // Include hydration scripts in the HTML
            bootstrapScripts: [
              ...(subresourceIntegrityManifest
                ? buildManifest.rootMainFiles.map((src) => ({
                    src: `${assetPrefix}/_next/` + src,
                    integrity: subresourceIntegrityManifest[src],
                  }))
                : buildManifest.rootMainFiles.map(
                    (src) => `${assetPrefix}/_next/` + src
                  )),
            ],
          },
        })

        const result = await continueFromInitialStream(renderStream, {
          dataStream: serverComponentsInlinedTransformStream?.readable,
          generateStaticHTML:
            staticGenerationStore.isStaticGeneration || generateStaticHTML,
          getServerInsertedHTML,
          serverInsertedHTMLToHead: true,
          ...validateRootLayout,
        })

        return result
      } catch (err: any) {
        const shouldNotIndex = err.digest === NOT_FOUND_ERROR_CODE
        if (err.digest === NOT_FOUND_ERROR_CODE) {
          res.statusCode = 404
        }

        const renderStream = await renderToInitialStream({
          ReactDOMServer,
          element: (
            <html id="__next_error__">
              <head>
                {shouldNotIndex ? (
                  <meta name="robots" content="noindex" />
                ) : null}
              </head>
              <body></body>
            </html>
          ),
          streamOptions: {
            nonce,
            // Include hydration scripts in the HTML
            bootstrapScripts: subresourceIntegrityManifest
              ? buildManifest.rootMainFiles.map((src) => ({
                  src: `${assetPrefix}/_next/` + src,
                  integrity: subresourceIntegrityManifest[src],
                }))
              : buildManifest.rootMainFiles.map(
                  (src) => `${assetPrefix}/_next/` + src
                ),
          },
        })

        return await continueFromInitialStream(renderStream, {
          dataStream: serverComponentsInlinedTransformStream?.readable,
          generateStaticHTML: staticGenerationStore.isStaticGeneration,
          getServerInsertedHTML,
          serverInsertedHTMLToHead: true,
          ...validateRootLayout,
        })
      }
    }
    const renderResult = new RenderResult(await bodyResult())

    if (staticGenerationStore.pendingRevalidates) {
      await Promise.all(staticGenerationStore.pendingRevalidates)
    }

    if (staticGenerationStore.isStaticGeneration) {
      const htmlResult = await streamToBufferedResult(renderResult)

      // if we encountered any unexpected errors during build
      // we fail the prerendering phase and the build
      if (capturedErrors.length > 0) {
        throw capturedErrors[0]
      }

      // TODO-APP: derive this from same pass to prevent additional
      // render during static generation
      const filteredFlightData = await streamToBufferedResult(
        await generateFlight()
      )

      if (staticGenerationStore.forceStatic === false) {
        staticGenerationStore.revalidate = 0
      }

      // TODO: investigate why `pageData` is not in RenderOpts
      ;(renderOpts as any).pageData = filteredFlightData

      // TODO: investigate why `revalidate` is not in RenderOpts
      ;(renderOpts as any).revalidate =
        staticGenerationStore.revalidate ?? defaultRevalidate

      // provide bailout info for debugging
      if ((renderOpts as any).revalidate === 0) {
        ;(renderOpts as any).staticBailoutInfo = {
          description: staticGenerationStore.dynamicUsageDescription,
          stack: staticGenerationStore.dynamicUsageStack,
        }
      }

      return new RenderResult(htmlResult)
    }

    return renderResult
  }

  return runWithRequestAsyncStorage(
    requestAsyncStorage,
    { req, res, renderOpts },
    () =>
      runWithStaticGenerationAsyncStorage(
        staticGenerationAsyncStorage,
        { pathname, renderOpts },
        () => wrappedRender()
      )
  )
}
