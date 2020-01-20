import { IncomingMessage, ServerResponse } from 'http'
import { ParsedUrlQuery } from 'querystring'
import { ComponentType } from 'react'
import { format, URLFormatOptions, UrlObject } from 'url'

import { ManifestItem } from '../server/render'
import { NextRouter } from './router/router'

/**
 * Types used by both next and next-server
 */

export type NextComponentType<
  C extends BaseContext = NextPageContext,
  IP = {},
  P = {}
> = ComponentType<P> & {
  /**
   * Used for initial page load data population. Data returned from `getInitialProps` is serialized when server rendered.
   * Make sure to return plain `Object` without using `Date`, `Map`, `Set`.
   * @param ctx Context of `page`
   */
  getInitialProps?(context: C): IP | Promise<IP>
}

export type DocumentType = NextComponentType<
  DocumentContext,
  DocumentInitialProps,
  DocumentProps
> & {
  renderDocument(
    Document: DocumentType,
    props: DocumentProps
  ): React.ReactElement
}

export type AppType = NextComponentType<
  AppContextType,
  AppInitialProps,
  AppPropsType
>

export type AppTreeType = ComponentType<
  AppInitialProps & { [name: string]: any }
>

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
) => RenderPageResult | Promise<RenderPageResult>

export type BaseContext = {
  res?: ServerResponse
  [k: string]: any
}

export type NEXT_DATA = {
  props: any
  page: string
  query: ParsedUrlQuery
  buildId: string
  assetPrefix?: string
  runtimeConfig?: { [key: string]: any }
  nextExport?: boolean
  autoExport?: boolean
  dynamicIds?: string[]
  err?: Error & { statusCode?: number }
}

/**
 * `Next` context
 */
// tslint:disable-next-line interface-name
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
   * `Component` the tree of the App to use if needing to render separately
   */
  AppTree: AppTreeType
}

export type AppContextType<R extends NextRouter = NextRouter> = {
  Component: NextComponentType<NextPageContext>
  AppTree: AppTreeType
  ctx: NextPageContext
  router: R
}

export type AppInitialProps = {
  pageProps: any
}

export type AppPropsType<
  R extends NextRouter = NextRouter,
  P = {}
> = AppInitialProps & {
  Component: NextComponentType<NextPageContext, any, P>
  router: R
}

export type DocumentContext = NextPageContext & {
  renderPage: RenderPage
}

export type DocumentInitialProps = RenderPageResult & {
  styles?: React.ReactElement[] | React.ReactFragment
}

export type DocumentProps = DocumentInitialProps & {
  __NEXT_DATA__: NEXT_DATA
  dangerousAsPath: string
  ampPath: string
  inAmpMode: boolean
  hybridAmp: boolean
  staticMarkup: boolean
  isDevelopment: boolean
  hasCssMode: boolean
  devFiles: string[]
  files: string[]
  polyfillFiles: string[]
  dynamicImports: ManifestItem[]
  assetPrefix?: string
  canonicalBase: string
  htmlProps: any
  bodyTags: any[]
  headTags: any[]
}

/**
 * Next `API` route request
 */
export type NextApiRequest = IncomingMessage & {
  /**
   * Object of `query` values from url
   */
  query: {
    [key: string]: string | string[]
  }
  /**
   * Object of `cookies` from header
   */
  cookies: {
    [key: string]: string
  }

  body: any
}

/**
 * Send body of response
 */
type Send<T> = (body: T) => void

/**
 * Next `API` route response
 */
export type NextApiResponse<T = any> = ServerResponse & {
  /**
   * Send data `any` data in response
   */
  send: Send<T>
  /**
   * Send data `json` data in response
   */
  json: Send<T>
  status: (statusCode: number) => NextApiResponse<T>
}

/**
 * Utils
 */
export function execOnce(this: any, fn: (...args: any) => any) {
  let used = false
  let result: any = null

  return (...args: any) => {
    if (!used) {
      used = true
      result = fn.apply(this, args)
    }
    return result
  }
}

export function getLocationOrigin() {
  const { protocol, hostname, port } = window.location
  return `${protocol}//${hostname}${port ? ':' + port : ''}`
}

export function getURL() {
  const { href } = window.location
  const origin = getLocationOrigin()
  return href.substring(origin.length)
}

export function getDisplayName(Component: ComponentType<any>) {
  return typeof Component === 'string'
    ? Component
    : Component.displayName || Component.name || 'Unknown'
}

export function isResSent(res: ServerResponse) {
  return res.finished || res.headersSent
}

export async function loadGetInitialProps<
  C extends BaseContext,
  IP = {},
  P = {}
>(App: NextComponentType<C, IP, P>, ctx: C): Promise<IP> {
  if (process.env.NODE_ENV !== 'production') {
    if (App.prototype?.getInitialProps) {
      const message = `"${getDisplayName(
        App
      )}.getInitialProps()" is defined as an instance method - visit https://err.sh/zeit/next.js/get-initial-props-as-an-instance-method for more information.`
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
    return {} as any
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
        )} returned an empty object from \`getInitialProps\`. This de-optimizes and prevents automatic static optimization. https://err.sh/zeit/next.js/empty-object-getInitialProps`
      )
    }
  }

  return props
}

export const urlObjectKeys = [
  'auth',
  'hash',
  'host',
  'hostname',
  'href',
  'path',
  'pathname',
  'port',
  'protocol',
  'query',
  'search',
  'slashes',
]

export function formatWithValidation(
  url: UrlObject,
  options?: URLFormatOptions
) {
  if (process.env.NODE_ENV === 'development') {
    if (url !== null && typeof url === 'object') {
      Object.keys(url).forEach(key => {
        if (urlObjectKeys.indexOf(key) === -1) {
          console.warn(
            `Unknown key passed via urlObject into url.format: ${key}`
          )
        }
      })
    }
  }

  return format(url as any, options)
}

export const SP = typeof performance !== 'undefined'
export const ST =
  SP &&
  typeof performance.mark === 'function' &&
  typeof performance.measure === 'function'
