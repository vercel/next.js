import type { HtmlProps } from './html-context.shared-runtime'
import type { ComponentType, JSX } from 'react'
import type { DomainLocale } from '../../server/config'
import type { Env } from '@next/env'
import type { IncomingMessage, ServerResponse } from 'http'
import type { NextRouter } from './router/router'
import type { ParsedUrlQuery } from 'querystring'
import type { PreviewData } from '../../types'
import type { COMPILER_NAMES } from './constants'
import type fs from 'fs'

export type NextComponentType<
  Context extends BaseContext = NextPageContext,
  InitialProps = {},
  Props = {},
> = ComponentType<Props> & {
  /**
   * Used for initial page load data population. Data returned from `getInitialProps` is serialized when server rendered.
   * Make sure to return plain `Object` without using `Date`, `Map`, `Set`.
   * @param context Context of `page`
   */
  getInitialProps?(context: Context): InitialProps | Promise<InitialProps>
}

export type DocumentType = NextComponentType<
  DocumentContext,
  DocumentInitialProps,
  DocumentProps
>

export type AppType<P = {}> = NextComponentType<
  AppContextType,
  P,
  AppPropsType<any, P>
>

export type AppTreeType = ComponentType<
  AppInitialProps & { [name: string]: any }
>

/**
 * Web vitals provided to _app.reportWebVitals by Core Web Vitals plugin developed by Google Chrome team.
 * https://nextjs.org/blog/next-9-4#integrated-web-vitals-reporting
 */
export const WEB_VITALS = ['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB'] as const
export type NextWebVitalsMetric = {
  id: string
  startTime: number
  value: number
  attribution?: { [key: string]: unknown }
} & (
  | {
      label: 'web-vital'
      name: (typeof WEB_VITALS)[number]
    }
  | {
      label: 'custom'
      name:
        | 'Next.js-hydration'
        | 'Next.js-route-change-to-render'
        | 'Next.js-render'
    }
)

export type Enhancer<C> = (Component: C) => C

export type ComponentsEnhancer =
  | {
      enhanceApp?: Enhancer<AppType>
      enhanceComponent?: Enhancer<NextComponentType>
    }
  | Enhancer<NextComponentType>

export type RenderPageResult = {
  html: string
  head?: Array<JSX.Element | null>
}

export type RenderPage = (
  options?: ComponentsEnhancer
) => DocumentInitialProps | Promise<DocumentInitialProps>

export type BaseContext = {
  res?: ServerResponse
  [k: string]: any
}

export type NEXT_DATA = {
  props: Record<string, any>
  page: string
  query: ParsedUrlQuery
  buildId: string
  assetPrefix?: string
  nextExport?: boolean
  autoExport?: boolean
  isFallback?: boolean
  isExperimentalCompile?: boolean
  dynamicIds?: (string | number)[]
  err?: Error & {
    statusCode?: number
    source?: typeof COMPILER_NAMES.server | typeof COMPILER_NAMES.edgeServer
  }
  gsp?: boolean
  gssp?: boolean
  customServer?: boolean
  gip?: boolean
  appGip?: boolean
  locale?: string
  locales?: readonly string[]
  defaultLocale?: string
  domainLocales?: readonly DomainLocale[]
  scriptLoader?: any[]
  isPreview?: boolean
  notFoundSrcPage?: string
}

/**
 * `Next` context
 */
export interface NextPageContext {
  /**
   * Error object if encountered during rendering
   */
  err?: (Error & { statusCode?: number }) | null
  /**
   * `HTTP` request object.
   */
  req?: IncomingMessage
  /**
   * `HTTP` response object.
   */
  res?: ServerResponse
  /**
   * Path section of `URL`.
   */
  pathname: string
  /**
   * Query string section of `URL` parsed as an object.
   */
  query: ParsedUrlQuery
  /**
   * `String` of the actual path including query.
   */
  asPath?: string
  /**
   * The currently active locale
   */
  locale?: string
  /**
   * All configured locales
   */
  locales?: readonly string[]
  /**
   * The configured default locale
   */
  defaultLocale?: string
  /**
   * `Component` the tree of the App to use if needing to render separately
   */
  AppTree: AppTreeType
}

export type AppContextType<Router extends NextRouter = NextRouter> = {
  Component: NextComponentType<NextPageContext>
  AppTree: AppTreeType
  ctx: NextPageContext
  router: Router
}

export type AppInitialProps<PageProps = any> = {
  pageProps: PageProps
}

export type AppPropsType<
  Router extends NextRouter = NextRouter,
  PageProps = {},
> = AppInitialProps<PageProps> & {
  Component: NextComponentType<NextPageContext, any, any>
  router: Router
  __N_SSG?: boolean
  __N_SSP?: boolean
}

export type DocumentContext = NextPageContext & {
  renderPage: RenderPage
  defaultGetInitialProps(
    ctx: DocumentContext,
    options?: { nonce?: string }
  ): Promise<DocumentInitialProps>
}

export type DocumentInitialProps = RenderPageResult & {
  styles?: React.ReactElement[] | Iterable<React.ReactNode> | JSX.Element
}

export type DocumentProps = DocumentInitialProps & HtmlProps

/**
 * Next `API` route request
 */
export interface NextApiRequest extends IncomingMessage {
  /**
   * Object of `query` values from url
   */
  query: Partial<{
    [key: string]: string | string[]
  }>
  /**
   * Object of `cookies` from header
   */
  cookies: Partial<{
    [key: string]: string
  }>

  body: any

  env: Env

  draftMode?: boolean

  preview?: boolean
  /**
   * Preview data set on the request, if any
   * */
  previewData?: PreviewData
}

/**
 * Send body of response
 */
type Send<T> = (body: T) => void

/**
 * Next `API` route response
 */
export type NextApiResponse<Data = any> = ServerResponse & {
  /**
   * Send data `any` data in response
   */
  send: Send<Data>
  /**
   * Send data `json` data in response
   */
  json: Send<Data>
  status: (statusCode: number) => NextApiResponse<Data>
  redirect(url: string): NextApiResponse<Data>
  redirect(status: number, url: string): NextApiResponse<Data>

  /**
   * Set draft mode
   */
  setDraftMode: (options: { enable: boolean }) => NextApiResponse<Data>

  /**
   * Set preview data for Next.js' prerender mode
   */
  setPreviewData: (
    data: object | string,
    options?: {
      /**
       * Specifies the number (in seconds) for the preview session to last for.
       * The given number will be converted to an integer by rounding down.
       * By default, no maximum age is set and the preview session finishes
       * when the client shuts down (browser is closed).
       */
      maxAge?: number
      /**
       * Specifies the path for the preview session to work under. By default,
       * the path is considered the "default path", i.e., any pages under "/".
       */
      path?: string
    }
  ) => NextApiResponse<Data>

  /**
   * Clear preview data for Next.js' prerender mode
   */
  clearPreviewData: (options?: { path?: string }) => NextApiResponse<Data>

  /**
   * Revalidate a specific page and regenerate it using On-Demand Incremental
   * Static Regeneration.
   * The path should be an actual path, not a rewritten path. E.g. for
   * "/blog/[slug]" this should be "/blog/post-1".
   * @link https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration#on-demand-revalidation-with-revalidatepath
   */
  revalidate: (
    urlPath: string,
    opts?: {
      unstable_onlyGenerated?: boolean
    }
  ) => Promise<void>
}

/**
 * Next `API` route handler
 */
export type NextApiHandler<T = any> = (
  req: NextApiRequest,
  res: NextApiResponse<T>
) => unknown | Promise<unknown>

/**
 * Utils
 */
export function execOnce<T extends (...args: any[]) => ReturnType<T>>(
  fn: T
): T {
  let used = false
  let result: ReturnType<T>

  return ((...args: any[]) => {
    if (!used) {
      used = true
      result = fn(...args)
    }
    return result
  }) as T
}

// Scheme: https://tools.ietf.org/html/rfc3986#section-3.1
// Absolute URL: https://tools.ietf.org/html/rfc3986#section-4.3
const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/
export const isAbsoluteUrl = (url: string) => ABSOLUTE_URL_REGEX.test(url)

export function getLocationOrigin() {
  const { protocol, hostname, port } = window.location
  return `${protocol}//${hostname}${port ? ':' + port : ''}`
}

export function getURL() {
  const { href } = window.location
  const origin = getLocationOrigin()
  return href.substring(origin.length)
}

export function getDisplayName<P>(Component: ComponentType<P>) {
  return typeof Component === 'string'
    ? Component
    : Component.displayName || Component.name || 'Unknown'
}

export function isResSent(res: ServerResponse) {
  return res.finished || res.headersSent
}

export function normalizeRepeatedSlashes(url: string) {
  const urlParts = url.split('?')
  const urlNoQuery = urlParts[0]

  return (
    urlNoQuery
      // first we replace any non-encoded backslashes with forward
      // then normalize repeated forward slashes
      .replace(/\\/g, '/')
      .replace(/\/\/+/g, '/') +
    (urlParts[1] ? `?${urlParts.slice(1).join('?')}` : '')
  )
}

export async function loadGetInitialProps<
  C extends BaseContext,
  IP = {},
  P = {},
>(App: NextComponentType<C, IP, P>, ctx: C): Promise<IP> {
  if (process.env.NODE_ENV !== 'production') {
    if (App.prototype?.getInitialProps) {
      const message = `"${getDisplayName(
        App
      )}.getInitialProps()" is defined as an instance method - visit https://nextjs.org/docs/messages/get-initial-props-as-an-instance-method for more information.`
      throw new Error(message)
    }
  }
  // when called from _app `ctx` is nested in `ctx`
  const res = ctx.res || (ctx.ctx && ctx.ctx.res)

  if (!App.getInitialProps) {
    if (ctx.ctx && ctx.Component) {
      // @ts-ignore pageProps default
      return {
        pageProps: await loadGetInitialProps(ctx.Component, ctx.ctx),
      }
    }
    return {} as IP
  }

  const props = await App.getInitialProps(ctx)

  if (res && isResSent(res)) {
    return props
  }

  if (!props) {
    const message = `"${getDisplayName(
      App
    )}.getInitialProps()" should resolve to an object. But found "${props}" instead.`
    throw new Error(message)
  }

  if (process.env.NODE_ENV !== 'production') {
    if (Object.keys(props).length === 0 && !ctx.ctx) {
      console.warn(
        `${getDisplayName(
          App
        )} returned an empty object from \`getInitialProps\`. This de-optimizes and prevents automatic static optimization. https://nextjs.org/docs/messages/empty-object-getInitialProps`
      )
    }
  }

  return props
}

export const SP = typeof performance !== 'undefined'
export const ST =
  SP &&
  (['mark', 'measure', 'getEntriesByName'] as const).every(
    (method) => typeof performance[method] === 'function'
  )

export class DecodeError extends Error {}
export class NormalizeError extends Error {}
export class PageNotFoundError extends Error {
  code: string

  constructor(page: string) {
    super()
    this.code = 'ENOENT'
    this.name = 'PageNotFoundError'
    this.message = `Cannot find module for page: ${page}`
  }
}

export class MissingStaticPage extends Error {
  constructor(page: string, message: string) {
    super()
    this.message = `Failed to load static file for page: ${page} ${message}`
  }
}

export class MiddlewareNotFoundError extends Error {
  code: string
  constructor() {
    super()
    this.code = 'ENOENT'
    this.message = `Cannot find the middleware module`
  }
}

export interface CacheFs {
  existsSync: typeof fs.existsSync
  readFile: typeof fs.promises.readFile
  readFileSync: typeof fs.readFileSync
  writeFile(f: string, d: any): Promise<void>
  mkdir(dir: string): Promise<void | string>
  stat(f: string): Promise<{ mtime: Date }>
}

export function stringifyError(error: Error) {
  return JSON.stringify({ message: error.message, stack: error.stack })
}
