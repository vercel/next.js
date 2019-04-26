import { format, UrlObject, URLFormatOptions } from 'url'
import { ServerResponse, IncomingMessage } from 'http';
import { ComponentType } from 'react'
import { ParsedUrlQuery } from 'querystring'
import { ManifestItem } from '../server/get-dynamic-import-bundles'
import { BaseRouter } from './router/router'

/**
 * Types used by both next and next-server
 */
export type NextComponentType<C extends BaseContext = any, P = any, CP = {}> = ComponentType<CP> & {
  getInitialProps?(context: C): Promise<P>,
}

export type DocumentType = NextComponentType<DocumentContext, DocumentInitialProps, DocumentProps>

export type AppType = NextComponentType<AppContextType, AppInitialProps, AppPropsType>

export type Enhancer<C> = (Component: C) => C

export type ComponentsEnhancer =
  | { enhanceApp?: Enhancer<AppType>; enhanceComponent?: Enhancer<NextComponentType> }
  | Enhancer<NextComponentType>

export type RenderPageResult = { html: string, head?: Array<JSX.Element | null>, dataOnly?: true }

export type RenderPage = (options?: ComponentsEnhancer) => RenderPageResult | Promise<RenderPageResult>

export type BaseContext = {
  res?: ServerResponse
  [k: string]: any,
}

export type INEXTDATA = {
  dataManager: string
  props: any
  page: string
  query: ParsedUrlQuery
  buildId: string
  dynamicBuildId: boolean
  assetPrefix?: string
  runtimeConfig?: { [key: string]: any }
  nextExport?: boolean
  dynamicIds?: string[]
  err?: Error & { statusCode?: number },
}

export interface IContext {
  err?: Error & { statusCode?: number } | null
  req?: IncomingMessage
  res?: ServerResponse
  pathname: string
  query: ParsedUrlQuery
  asPath?: string
}

export type AppContextType<R extends BaseRouter = BaseRouter> = {
  Component: NextComponentType<IContext>
  router: R
  ctx: IContext,
}

export type AppInitialProps = {
  pageProps: any,
}

export type AppPropsType<R extends BaseRouter = BaseRouter> = AppInitialProps & {
  Component: NextComponentType<IContext>
  router: R,
}

export type DocumentContext = IContext & {
  renderPage: RenderPage,
}

export type DocumentInitialProps = RenderPageResult & {
  styles?: React.ReactElement[],
}

export type DocumentProps = DocumentInitialProps & {
  __NEXT_DATA__: INEXTDATA
  dangerousAsPath: string
  ampPath: string
  amphtml: boolean
  hasAmp: boolean
  staticMarkup: boolean
  devFiles: string[]
  files: string[]
  dynamicImports: ManifestItem[]
  assetPrefix?: string,
}

/**
 * Utils
 */

export function execOnce(this: any, fn: () => any) {
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
  return typeof Component === 'string' ? Component : (Component.displayName || Component.name || 'Unknown')
}

export function isResSent(res: ServerResponse) {
  return res.finished || res.headersSent
}

export async function loadGetInitialProps<C extends BaseContext, P = any, CP = {}>(Component: NextComponentType<C, P, CP>, ctx: C): Promise<P | null> {
  if (process.env.NODE_ENV !== 'production') {
    if (Component.prototype && Component.prototype.getInitialProps) {
      const message = `"${getDisplayName(Component)}.getInitialProps()" is defined as an instance method - visit https://err.sh/zeit/next.js/get-initial-props-as-an-instance-method for more information.`
      throw new Error(message)
    }
  }

  if (!Component.getInitialProps) {
    if (ctx.res && ctx.res.setHeader) {
      ctx.res.setHeader('Cache-Control', 'stale-while-revalidate=30')
    }
    return null
  }

  const props = await Component.getInitialProps(ctx)

  if (ctx.res && isResSent(ctx.res)) {
    return props
  }

  if (!props) {
    const message = `"${getDisplayName(Component)}.getInitialProps()" should resolve to an object. But found "${props}" instead.`
    throw new Error(message)
  }

  return props
}

export const urlObjectKeys = ['auth', 'hash', 'host', 'hostname', 'href', 'path', 'pathname', 'port', 'protocol', 'query', 'search', 'slashes']

export function formatWithValidation(url: UrlObject, options?: URLFormatOptions) {
  if (process.env.NODE_ENV === 'development') {
    if (url !== null && typeof url === 'object') {
      Object.keys(url).forEach((key) => {
        if (urlObjectKeys.indexOf(key) === -1) {
          console.warn(`Unknown key passed via urlObject into url.format: ${key}`)
        }
      })
    }
  }

  return format(url as any, options)
}
