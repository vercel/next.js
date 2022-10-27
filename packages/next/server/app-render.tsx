import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http'
import type { LoadComponentsReturnType } from './load-components'
import type { ServerRuntime } from '../types'
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
import { shouldUseReactRoot } from './utils'
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
import { HeadManagerContext } from '../shared/lib/head-manager-context'
import { Writable } from 'stream'
import stringHash from 'next/dist/compiled/string-hash'

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
  capturedErrors: Error[],
  allCapturedErrors?: Error[]
) {
  return (err: any): string => {
    if (allCapturedErrors) allCapturedErrors.push(err)

    if (
      err.digest === DYNAMIC_ERROR_CODE ||
      err.digest === NOT_FOUND_ERROR_CODE ||
      err.digest?.startsWith(REDIRECT_ERROR_CODE)
    ) {
      return err.digest
    }

    // Used for debugging error source
    // console.error(_source, err)
    console.error(err)
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

  const staticGenerationAsyncStorage = ComponentMod.staticGenerationAsyncStorage

  const originFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const staticGenerationStore =
      'getStore' in staticGenerationAsyncStorage
        ? staticGenerationAsyncStorage.getStore()
        : staticGenerationAsyncStorage

    const { isStaticGeneration, fetchRevalidate, pathname } =
      staticGenerationStore || {}

    if (staticGenerationStore && isStaticGeneration) {
      if (init && typeof init === 'object') {
        if (init.cache === 'no-store') {
          staticGenerationStore.fetchRevalidate = 0
          // TODO: ensure this error isn't logged to the user
          // seems it's slipping through currently
          throw new DynamicServerError(
            `no-store fetch ${input}${pathname ? ` ${pathname}` : ''}`
          )
        }

        const hasNextConfig = 'next' in init
        const next = init.next || {}
        if (
          typeof next.revalidate === 'number' &&
          (typeof fetchRevalidate === 'undefined' ||
            next.revalidate < fetchRevalidate)
        ) {
          staticGenerationStore.fetchRevalidate = next.revalidate

          if (next.revalidate === 0) {
            throw new DynamicServerError(
              `revalidate: ${next.revalidate} fetch ${input}${
                pathname ? ` ${pathname}` : ''
              }`
            )
          }
        }
        if (hasNextConfig) delete init.next
      }
    }
    return originFetch(input, init)
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
    moduleMap:
      process.env.NEXT_RUNTIME === 'edge'
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
  ComponentToRender: React.ComponentType,
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
      ...FlightSegmentPath,
      /* segment of the rendered slice: */ Segment,
      /* treePatch */ FlightRouterState,
      /* subTreeData: */ React.ReactNode | null // Can be null during prefetch if there's no loading component
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
  serverCSSForEntries: string[]
): string[] {
  const layoutOrPageCss =
    serverCSSManifest[filePath] ||
    serverComponentManifest.__client_css_manifest__?.[filePath]

  if (!layoutOrPageCss) {
    return []
  }

  const chunks = new Set<string>()

  for (const css of layoutOrPageCss) {
    // We only include the CSS if it's a global CSS, or it is used by this
    // entrypoint.
    if (serverCSSForEntries.includes(css) || !/\.module\.css/.test(css)) {
      const mod = serverComponentManifest[css]
      if (mod) {
        for (const chunk of mod.default.chunks) {
          chunks.add(chunk)
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
      serverCSSManifest.__entry_css__ &&
      serverCSSManifest.__entry_css__[entryName]
    ) {
      css.push(...serverCSSManifest.__entry_css__[entryName])
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
): string[] {
  if (!fontLoaderManifest || !filePath) {
    return []
  }
  const layoutOrPageCss =
    serverCSSManifest[filePath] ||
    serverComponentManifest.__client_css_manifest__?.[filePath]

  if (!layoutOrPageCss) {
    return []
  }

  const fontFiles = new Set<string>()

  for (const css of layoutOrPageCss) {
    // We only include the CSS if it is used by this entrypoint.
    if (serverCSSForEntries.includes(css)) {
      const preloadedFontFiles = fontLoaderManifest.app[css]
      if (preloadedFontFiles) {
        for (const fontFile of preloadedFontFiles) {
          fontFiles.add(fontFile)
        }
      }
    }
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

const FLIGHT_PARAMETERS = [
  '__rsc__',
  '__next_router_state_tree__',
  '__next_router_prefetch__',
] as const

function headersWithoutFlight(headers: IncomingHttpHeaders) {
  const newHeaders = { ...headers }
  for (const param of FLIGHT_PARAMETERS) {
    delete newHeaders[param]
  }
  return newHeaders
}

async function renderToString(element: React.ReactElement) {
  if (!shouldUseReactRoot) return ReactDOMServer.renderToString(element)
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
  const isStaticGeneration =
    renderOpts.supportsDynamicHTML !== true && !renderOpts.isBot
  const isFlight = req.headers.__rsc__ !== undefined

  const capturedErrors: Error[] = []
  const allCapturedErrors: Error[] = []

  const serverComponentsErrorHandler = createErrorHandler(
    'serverComponentsRenderer',
    capturedErrors
  )
  const flightDataRendererErrorHandler = createErrorHandler(
    'flightDataRenderer',
    capturedErrors
  )
  const htmlRendererErrorHandler = createErrorHandler(
    'htmlRenderer',
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

  if (process.env.NODE_ENV === 'production') {
    patchFetch(ComponentMod)
  }
  const generateStaticHTML = supportsDynamicHTML !== true

  const staticGenerationAsyncStorage = ComponentMod.staticGenerationAsyncStorage
  const requestAsyncStorage = ComponentMod.requestAsyncStorage

  if (
    staticGenerationAsyncStorage &&
    !('getStore' in staticGenerationAsyncStorage) &&
    staticGenerationAsyncStorage.inUse
  ) {
    throw new Error(
      `Invariant: A separate worker must be used for each render when AsyncLocalStorage is not available`
    )
  }

  // we wrap the render in an AsyncLocalStorage context
  const wrappedRender = async () => {
    const staticGenerationStore =
      'getStore' in staticGenerationAsyncStorage
        ? staticGenerationAsyncStorage.getStore()
        : staticGenerationAsyncStorage

    // don't modify original query object
    query = Object.assign({}, query)

    const isPrefetch = req.headers.__next_router_prefetch__ !== undefined

    // TODO-APP: verify the tree is valid
    // TODO-APP: verify query param is single value (not an array)
    // TODO-APP: verify tree can't grow out of control
    /**
     * Router state provided from the client-side router. Used to handle rendering from the common layout down.
     */
    let providedFlightRouterState: FlightRouterState = isFlight
      ? req.headers.__next_router_state_tree__
        ? JSON.parse(req.headers.__next_router_state_tree__ as string)
        : undefined
      : undefined

    /**
     * The tree created in next-app-loader that holds component segments and modules
     */
    const loaderTree: LoaderTree = ComponentMod.tree

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
        const Head = await interopDefault(head())
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

    /**
     * Use the provided loader tree to create the React Component tree.
     */
    const createComponentTree = async ({
      createSegmentPath,
      loaderTree: [
        segment,
        parallelRoutes,
        {
          layoutOrPagePath,
          layout,
          template,
          error,
          loading,
          page,
          'not-found': notFound,
        },
      ],
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
      // TODO-APP: enable stylesheet per layout/page
      const stylesheets: string[] = layoutOrPagePath
        ? getCssInlinedLinkTags(
            serverComponentManifest,
            serverCSSManifest!,
            layoutOrPagePath,
            serverCSSForEntries
          )
        : []

      const preloadedFontFiles = getPreloadedFontFilesInlineLinkTags(
        serverComponentManifest,
        serverCSSManifest!,
        fontLoaderManifest,
        serverCSSForEntries,
        layoutOrPagePath
      )
      const Template = template
        ? await interopDefault(template())
        : React.Fragment
      const ErrorComponent = error ? await interopDefault(error()) : undefined
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

      const NotFound = notFound
        ? await interopDefault(notFound())
        : rootLayoutAtThisLevel
        ? DefaultNotFound
        : undefined

      if (typeof layoutOrPageMod?.revalidate === 'number') {
        defaultRevalidate = layoutOrPageMod.revalidate

        if (isStaticGeneration && defaultRevalidate === 0) {
          const { DynamicServerError } =
            ComponentMod.serverHooks as typeof import('../client/components/hooks-server-context')

          throw new DynamicServerError(`revalidate: 0 configured ${segment}`)
        }
      }

      // TODO-APP: move these errors to the loader instead?
      // we will also need a migration doc here to link to
      if (typeof layoutOrPageMod?.getServerSideProps === 'function') {
        throw new Error(
          `getServerSideProps is not supported in app/, detected in ${segment}`
        )
      }

      if (typeof layoutOrPageMod?.getStaticProps === 'function') {
        throw new Error(
          `getStaticProps is not supported in app/, detected in ${segment}`
        )
      }

      /**
       * The React Component to render.
       */
      const Component = layoutOrPageMod
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
                  hasLoading={Boolean(Loading)}
                  error={ErrorComponent}
                  template={
                    <Template>
                      <RenderFromTemplateContext />
                    </Template>
                  }
                  notFound={NotFound ? <NotFound /> : undefined}
                  childProp={childProp}
                  rootLayoutIncluded={rootLayoutIncludedAtThisLevelOrAbove}
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
                loading={Loading ? <Loading /> : undefined}
                // TODO-APP: Add test for loading returning `undefined`. This currently can't be tested as the `webdriver()` tab will wait for the full page to load before returning.
                hasLoading={Boolean(Loading)}
                template={
                  <Template>
                    <RenderFromTemplateContext />
                  </Template>
                }
                notFound={NotFound ? <NotFound /> : undefined}
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

      return {
        Component: () => {
          let props = {}

          // Add extra cache busting (DEV only) for https://github.com/vercel/next.js/issues/5860
          // See also https://bugs.webkit.org/show_bug.cgi?id=187726
          const cacheBustingUrlSuffix = dev ? `?ts=${Date.now()}` : ''

          return (
            <>
              {preloadedFontFiles.map((fontFile) => {
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
              })}
              {stylesheets
                ? stylesheets.map((href, index) => (
                    <link
                      rel="stylesheet"
                      href={`${assetPrefix}/_next/${href}${cacheBustingUrlSuffix}`}
                      // `Precedence` is an opt-in signal for React to handle
                      // resource loading and deduplication, etc:
                      // https://github.com/facebook/react/pull/25060
                      // @ts-ignore
                      precedence="high"
                      key={index}
                    />
                  ))
                : null}
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
              {/* {HeadTags ? <HeadTags /> : null} */}
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
      }: {
        createSegmentPath: CreateSegmentPath
        loaderTreeToFilter: LoaderTree
        parentParams: { [key: string]: string | string[] }
        isFirst: boolean
        flightRouterState?: FlightRouterState
        parentRendered?: boolean
      }): Promise<FlightDataPath> => {
        const [segment, parallelRoutes] = loaderTreeToFilter
        const parallelRoutesKeys = Object.keys(parallelRoutes)

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
                React.createElement(
                  (
                    await createComponentTree(
                      // This ensures flightRouterPath is valid and filters down the tree
                      {
                        createSegmentPath: (child) => {
                          return createSegmentPath(child)
                        },
                        loaderTree: loaderTreeToFilter,
                        parentParams: currentParams,
                        firstItem: isFirst,
                      }
                    )
                  ).Component
                ),
          ]
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
          })

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
          await walkTreeWithFlightRouterState({
            createSegmentPath: (child) => child,
            loaderTreeToFilter: loaderTree,
            parentParams: {},
            flightRouterState: providedFlightRouterState,
            isFirst: true,
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

    if (isFlight && !isStaticGeneration) {
      return generateFlight()
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
      ComponentMod.AppRouter as typeof import('../client/components/app-router').default

    let serverComponentsInlinedTransformStream: TransformStream<
      Uint8Array,
      Uint8Array
    > = new TransformStream()

    // TODO-APP: validate req.url as it gets passed to render.
    const initialCanonicalUrl = req.url!

    // Get the nonce from the incomming request if it has one.
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
      () => {
        const initialTree = createFlightRouterStateFromLoaderTree(loaderTree)

        return (
          <AppRouter
            assetPrefix={assetPrefix}
            initialCanonicalUrl={initialCanonicalUrl}
            initialTree={initialTree}
            initialHead={initialHead}
          >
            <ComponentTree />
          </AppRouter>
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
          generateStaticHTML: isStaticGeneration || generateStaticHTML,
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

        // TODO-APP: show error overlay in development. `element` should probably be wrapped in AppRouter for this case.
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
          generateStaticHTML: isStaticGeneration,
          getServerInsertedHTML,
          serverInsertedHTMLToHead: true,
          ...validateRootLayout,
        })
      }
    }
    const renderResult = new RenderResult(await bodyResult())

    if (isStaticGeneration) {
      const htmlResult = await streamToBufferedResult(renderResult)

      // if we encountered any unexpected errors during build
      // we fail the prerendering phase and the build
      if (capturedErrors.length > 0) {
        throw capturedErrors[0]
      }
      // const before = Buffer.concat(
      //   serverComponentsRenderOpts.rscChunks
      // ).toString()

      // TODO-APP: derive this from same pass to prevent additional
      // render during static generation
      const filteredFlightData = await streamToBufferedResult(
        await generateFlight()
      )

      ;(renderOpts as any).pageData = filteredFlightData
      ;(renderOpts as any).revalidate =
        typeof staticGenerationStore?.fetchRevalidate === 'undefined'
          ? defaultRevalidate
          : staticGenerationStore?.fetchRevalidate

      return new RenderResult(htmlResult)
    }

    return renderResult
  }

  const initialStaticGenerationStore = {
    isStaticGeneration,
    inUse: true,
    pathname,
  }

  const tryGetPreviewData =
    process.env.NEXT_RUNTIME === 'edge'
      ? () => false
      : require('./api-utils/node').tryGetPreviewData

  // Reads of this are cached on the `req` object, so this should resolve
  // instantly. There's no need to pass this data down from a previous
  // invoke, where we'd have to consider server & serverless.
  const previewData = tryGetPreviewData(
    req,
    res,
    (renderOpts as any).previewProps
  )

  let cachedHeadersInstance: ReadonlyHeaders | undefined
  let cachedCookiesInstance: ReadonlyRequestCookies | undefined

  const requestStore = {
    get headers() {
      if (!cachedHeadersInstance) {
        cachedHeadersInstance = new ReadonlyHeaders(
          headersWithoutFlight(req.headers)
        )
      }
      return cachedHeadersInstance
    },
    get cookies() {
      if (!cachedCookiesInstance) {
        cachedCookiesInstance = new ReadonlyRequestCookies({
          headers: {
            get: (key) => {
              if (key !== 'cookie') {
                throw new Error('Only cookie header is supported')
              }
              return req.headers.cookie
            },
          },
        })
      }
      return cachedCookiesInstance
    },
    previewData,
  }

  function handleRequestStoreRun<T>(fn: () => T): Promise<T> {
    if ('getStore' in requestAsyncStorage) {
      return new Promise((resolve, reject) => {
        requestAsyncStorage.run(requestStore, () => {
          return Promise.resolve(fn()).then(resolve).catch(reject)
        })
      })
    } else {
      Object.assign(requestAsyncStorage, requestStore)
      return Promise.resolve(fn())
    }
  }

  function handleStaticGenerationStoreRun<T>(fn: () => T): Promise<T> {
    if ('getStore' in staticGenerationAsyncStorage) {
      return new Promise((resolve, reject) => {
        staticGenerationAsyncStorage.run(initialStaticGenerationStore, () => {
          return Promise.resolve(fn()).then(resolve).catch(reject)
        })
      })
    } else {
      Object.assign(staticGenerationAsyncStorage, initialStaticGenerationStore)
      return Promise.resolve(fn()).finally(() => {
        staticGenerationAsyncStorage.inUse = false
      })
    }
  }

  return handleRequestStoreRun(() =>
    handleStaticGenerationStoreRun(() => wrappedRender())
  )
}
