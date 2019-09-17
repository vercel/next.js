import { format, UrlObject, URLFormatOptions } from 'url'
import { ServerResponse, IncomingMessage } from 'http'
import { ComponentType } from 'react'
import { ParsedUrlQuery } from 'querystring'
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
  getInitialProps?(context: C): IP | Promise<IP>
}

export type DocumentType = NextComponentType<
  DocumentContext,
  DocumentInitialProps,
  DocumentProps
>

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
  dataOnly?: true
}

export type RenderPage = (
  options?: ComponentsEnhancer
) => RenderPageResult | Promise<RenderPageResult>

export type BaseContext = {
  res?: ServerResponse
  [k: string]: any
}

export type NEXT_DATA = {
  dataManager: string
  props: any
  page: string
  query: ParsedUrlQuery
  buildId: string
  assetPrefix?: string
  runtimeConfig?: { [key: string]: any }
  nextExport?: boolean
  autoExport?: boolean
  skeleton?: boolean
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
  err?: Error & { statusCode?: number } | null
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
  devFiles: string[]
  files: string[]
  dynamicImports: ManifestItem[]
  assetPrefix?: string
  canonicalBase: string
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
  return (...args: any) => {
    if (!used) {
      used = true
      fn.apply(this, args)
    }
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
>(Component: NextComponentType<C, IP, P>, ctx: C): Promise<IP> {
  if (process.env.NODE_ENV !== 'production') {
    if (Component.prototype && Component.prototype.getInitialProps) {
      const message = `"${getDisplayName(
        Component
      )}.getInitialProps()" is defined as an instance method - visit https://err.sh/zeit/next.js/get-initial-props-as-an-instance-method for more information.`
      throw new Error(message)
    }
  }
  // when called from _app `ctx` is nested in `ctx`
  const res = ctx.res || (ctx.ctx && ctx.ctx.res)

  if (!Component.getInitialProps) {
    return {} as any
  }

  const props = await Component.getInitialProps(ctx)

  if (res && isResSent(res)) {
    return props
  }

  if (!props) {
    const message = `"${getDisplayName(
      Component
    )}.getInitialProps()" should resolve to an object. But found "${props}" instead.`
    throw new Error(message)
  }

  if (process.env.NODE_ENV !== 'production') {
    if (Object.keys(props).length === 0 && !ctx.ctx) {
      console.warn(
        `${getDisplayName(
          Component
        )} returned an empty object from \`getInitialProps\`. This de-optimizes and prevents automatic prerendering. https://err.sh/zeit/next.js/empty-object-getInitialProps`
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

export const SUPPORTS_PERFORMANCE = typeof performance !== 'undefined'
export const SUPPORTS_PERFORMANCE_USER_TIMING =
  SUPPORTS_PERFORMANCE &&
  typeof performance.mark === 'function' &&
  typeof performance.measure === 'function'
