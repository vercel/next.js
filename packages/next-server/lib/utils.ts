import { format, UrlObject,  URLFormatOptions } from 'url'
import { ServerResponse, IncomingMessage } from 'http';
import { ComponentType } from 'react'
import { ParsedUrlQuery } from 'querystring'
import { ManifestItem } from '../server/get-dynamic-import-bundles'

/**
 * Types used by both next and next-server
 */

export type NextComponentType<C = any, P = any, CP = any> = ComponentType<CP> & {
  getInitialProps?(context: C): Promise<P>,
}

export type Enhancer = (Component: React.ComponentType) => React.ComponentType

export type ComponentsEnhancer =
  | { enhanceApp?: Enhancer; enhanceComponent?: Enhancer }
  | Enhancer

export type RenderPageResult = { html: string, head: any, dataOnly?: true }

export type RenderPage = (options?: ComponentsEnhancer) => RenderPageResult | Promise<RenderPageResult>

export interface INEXTDATA {
  page: string
  buildId: string
  query: ParsedUrlQuery
  dynamicBuildId: boolean
}

export interface IContext {
  err?: Error & { statusCode?: number } | null
  req?: IncomingMessage
  res?: ServerResponse
  pathname: string
  query: ParsedUrlQuery
  asPath?: string
}

export interface IAppContext<R> {
  Component: NextComponentType<IContext>
  router: R
  ctx: IContext
}

export interface IDocumentContext extends IContext {
  renderPage: RenderPage
}

export interface IDocumentInitialProps extends RenderPageResult {
  styles: React.ReactElement[]
}

export interface IDocumentProps extends IDocumentInitialProps {
  __NEXT_DATA__: INEXTDATA
  dangerousAsPath: string
  ampPath: string
  amphtml: boolean
  hasAmp: boolean
  staticMarkup: boolean
  devFiles: string[]
  files: string[]
  dynamicImports: ManifestItem[]
  assetPrefix?: string
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

export function getDisplayName(Component: ComponentType) {
  return typeof Component === 'string' ? Component : (Component.displayName || Component.name || 'Unknown')
}

export function isResSent(res: ServerResponse) {
  return res.finished || res.headersSent
}

export async function loadGetInitialProps<C extends { res?: ServerResponse, [k: string]: any }, P = any>(Component: NextComponentType<C, P>, ctx: C): Promise<P | null> {
  if (process.env.NODE_ENV !== 'production') {
    if (Component.prototype && Component.prototype.getInitialProps) {
      const message = `"${getDisplayName(Component)}.getInitialProps()" is defined as an instance method - visit https://err.sh/zeit/next.js/get-initial-props-as-an-instance-method for more information.`
      throw new Error(message)
    }
  }

  if (!Component.getInitialProps) return null

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

export function formatWithValidation(url: URL | UrlObject, options?: URLFormatOptions) {
  if (process.env.NODE_ENV === 'development') {
    if (url !== null && typeof url === 'object') {
      Object.keys(url).forEach((key) => {
        if (urlObjectKeys.indexOf(key) === -1) {
          console.warn(`Unknown key passed via urlObject into url.format: ${key}`)
        }
      })
    }
  }

  return url instanceof URL ? format(url, options) : format(url)
}
