/// <reference types="node" />
/// <reference types="react" />
/// <reference types="react/experimental" />
/// <reference types="react-dom" />
/// <reference types="react-dom/experimental" />

import type { Agent as HttpAgent } from 'http'
import type { Agent as HttpsAgent } from 'https'

import type React from 'react'
import type { ParsedUrlQuery } from 'querystring'
import type { IncomingMessage, ServerResponse } from 'http'

import {
  NextPageContext,
  NextComponentType,
  NextApiResponse,
  NextApiRequest,
  NextApiHandler,
  // @ts-ignore This path is generated at build time and conflicts otherwise
} from 'next/dist/shared/lib/utils'

import type {
  NextApiRequestCookies,
  // @ts-ignore This path is generated at build time and conflicts otherwise
} from 'next/dist/server/api-utils'

// @ts-ignore This path is generated at build time and conflicts otherwise
import next from 'next/dist/server/next'

export type ServerRuntime = 'nodejs' | 'experimental-edge' | 'edge' | undefined

// @ts-ignore This path is generated at build time and conflicts otherwise
export { NextConfig } from 'next/dist/server/config'

export type {
  Metadata,
  MetadataRoute,
  ResolvedMetadata,
  ResolvingMetadata,
  Viewport,
  ResolvingViewport,
  ResolvedViewport,
  // @ts-ignore This path is generated at build time and conflicts otherwise
} from 'next/dist/lib/metadata/types/metadata-interface'

/**
 * Stub route type for typedRoutes before `next dev` or `next build` is run
 * @link https://nextjs.org/docs/app/building-your-application/configuring/typescript#statically-typed-links
 * @example
 * ```ts
 * import type { Route } from 'next'
 * // ...
 * router.push(returnToPath as Route)
 * ```
 */

// `RouteInferType` is a stub here to avoid breaking `typedRoutes` when the type
// isn't generated yet. It will be replaced when the webpack plugin runs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type Route<RouteInferType = any> = string & {}

// Extend the React types with missing properties
declare module 'react' {
  // <html amp=""> support
  interface HtmlHTMLAttributes<T> extends React.HTMLAttributes<T> {
    amp?: string
  }

  // <img fetchPriority=""> support
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- It's actually required for module augmentation to work.
  interface ImgHTMLAttributes<T> {
    fetchPriority?: 'high' | 'low' | 'auto' | undefined
  }
}

export type Redirect =
  | {
      statusCode: 301 | 302 | 303 | 307 | 308
      destination: string
      basePath?: false
    }
  | {
      permanent: boolean
      destination: string
      basePath?: false
    }

/**
 * `NextPage` type, use it as a guide to create `pages`.
 */
export type NextPage<Props = {}, InitialProps = Props> = NextComponentType<
  NextPageContext,
  InitialProps,
  Props
>

export type FileSizeSuffix = `${
  | 'k'
  | 'K'
  | 'm'
  | 'M'
  | 'g'
  | 'G'
  | 't'
  | 'T'
  | 'p'
  | 'P'}${'b' | 'B'}`

export type SizeLimit = number | `${number}${FileSizeSuffix}`

export type ResponseLimit = SizeLimit | boolean

/**
 * `Config` type, use it for export const config
 */
export type PageConfig = {
  amp?: boolean | 'hybrid'
  api?: {
    /**
     * Configures or disables body size limit warning. Can take a number or
     * any string format supported by `bytes`, for example `1000`, `'500kb'` or
     * `'3mb'`.
     */
    responseLimit?: ResponseLimit
    /**
     * The byte limit of the body. This is the number of bytes or any string
     * format supported by `bytes`, for example `1000`, `'500kb'` or `'3mb'`.
     */
    bodyParser?:
      | {
          sizeLimit?: SizeLimit
        }
      | false
    /**
     * Flag to disable warning "API page resolved
     * without sending a response", due to explicitly
     * using an external API resolver, like express
     */
    externalResolver?: true
  }
  env?: Array<string>
  /**
   * Configures the longest time in seconds a serverless function can process an HTTP
   * request before responding.
   */
  maxDuration?: number
  runtime?: ServerRuntime
  unstable_runtimeJS?: false
  unstable_JsPreload?: false
  /**
   * @deprecated this config has been removed in favor of the next.config.js option
   */
  // TODO: remove in next minor release (current v13.1.1)
  unstable_includeFiles?: string[]
  /**
   * @deprecated this config has been removed in favor of the next.config.js option
   */
  // TODO: remove in next minor release (current v13.1.1)
  unstable_excludeFiles?: string[]
}

export {
  NextPageContext,
  NextComponentType,
  NextApiResponse,
  NextApiRequest,
  NextApiHandler,
}

export type PreviewData = string | false | object | undefined

/**
 * Context object passed into `getStaticProps`.
 * @link https://nextjs.org/docs/api-reference/data-fetching/get-static-props#context-parameter
 */
export type GetStaticPropsContext<
  Params extends ParsedUrlQuery = ParsedUrlQuery,
  Preview extends PreviewData = PreviewData
> = {
  params?: Params
  preview?: boolean
  previewData?: Preview
  draftMode?: boolean
  locale?: string
  locales?: string[]
  defaultLocale?: string
}

/**
 * The return type of `getStaticProps`.
 * @link https://nextjs.org/docs/api-reference/data-fetching/get-static-props#getstaticprops-return-values
 */
export type GetStaticPropsResult<Props> =
  | { props: Props; revalidate?: number | boolean }
  | { redirect: Redirect; revalidate?: number | boolean }
  | { notFound: true; revalidate?: number | boolean }

/**
 * Static Site Generation feature for Next.js.
 * @link https://nextjs.org/docs/basic-features/data-fetching/get-static-props
 * @link https://nextjs.org/docs/basic-features/typescript#static-generation-and-server-side-rendering
 * @example
 * ```ts
 * export const getStaticProps: GetStaticProps = async (context) => {
 *   // ...
 * }
 * ```
 */
export type GetStaticProps<
  Props extends { [key: string]: any } = { [key: string]: any },
  Params extends ParsedUrlQuery = ParsedUrlQuery,
  Preview extends PreviewData = PreviewData
> = (
  context: GetStaticPropsContext<Params, Preview>
) => Promise<GetStaticPropsResult<Props>> | GetStaticPropsResult<Props>

export type InferGetStaticPropsType<T extends (args: any) => any> = Extract<
  Awaited<ReturnType<T>>,
  { props: any }
>['props']

export type GetStaticPathsContext = {
  locales?: string[]
  defaultLocale?: string
}

/**
 * The return type of `getStaticPaths`.
 * @link https://nextjs.org/docs/api-reference/data-fetching/get-static-paths#getstaticpaths-return-values
 */
export type GetStaticPathsResult<
  Params extends ParsedUrlQuery = ParsedUrlQuery
> = {
  paths: Array<string | { params: Params; locale?: string }>
  fallback: boolean | 'blocking'
}

/**
 * Define a list of paths to be statically generated if dynamic routes exist.
 * @link https://nextjs.org/docs/basic-features/data-fetching/get-static-paths
 * @link https://nextjs.org/docs/basic-features/typescript#static-generation-and-server-side-rendering
 * @example
 * ```ts
 * export const getStaticPaths: GetStaticPaths = async () => {
 *  // ...
 * }
 * ```
 */
export type GetStaticPaths<Params extends ParsedUrlQuery = ParsedUrlQuery> = (
  context: GetStaticPathsContext
) => Promise<GetStaticPathsResult<Params>> | GetStaticPathsResult<Params>

/**
 * Context object passed into `getServerSideProps`.
 * @link https://nextjs.org/docs/api-reference/data-fetching/get-server-side-props#context-parameter
 */
export type GetServerSidePropsContext<
  Params extends ParsedUrlQuery = ParsedUrlQuery,
  Preview extends PreviewData = PreviewData
> = {
  req: IncomingMessage & {
    cookies: NextApiRequestCookies
  }
  res: ServerResponse
  params?: Params
  query: ParsedUrlQuery
  preview?: boolean
  previewData?: Preview
  draftMode?: boolean
  resolvedUrl: string
  locale?: string
  locales?: string[]
  defaultLocale?: string
}

/**
 * The return type of `getServerSideProps`.
 * @link https://nextjs.org/docs/api-reference/data-fetching/get-server-side-props#getserversideprops-return-values
 */
export type GetServerSidePropsResult<Props> =
  | { props: Props | Promise<Props> }
  | { redirect: Redirect }
  | { notFound: true }

/**
 * Server-side Rendering feature for Next.js.
 * @link https://nextjs.org/docs/basic-features/data-fetching/get-server-side-props
 * @link https://nextjs.org/docs/basic-features/typescript#static-generation-and-server-side-rendering
 * @example
 * ```ts
 * export const getServerSideProps: GetServerSideProps = async (context) => {
 *  // ...
 * }
 */
export type GetServerSideProps<
  Props extends { [key: string]: any } = { [key: string]: any },
  Params extends ParsedUrlQuery = ParsedUrlQuery,
  Preview extends PreviewData = PreviewData
> = (
  context: GetServerSidePropsContext<Params, Preview>
) => Promise<GetServerSidePropsResult<Props>>

export type InferGetServerSidePropsType<T extends (args: any) => any> = Awaited<
  Extract<Awaited<ReturnType<T>>, { props: any }>['props']
>

declare global {
  interface Crypto {
    readonly subtle: SubtleCrypto
    getRandomValues<
      T extends
        | Int8Array
        | Int16Array
        | Int32Array
        | Uint8Array
        | Uint16Array
        | Uint32Array
        | Uint8ClampedArray
        | Float32Array
        | Float64Array
        | DataView
        | null
    >(
      array: T
    ): T
    randomUUID(): string
  }

  var __NEXT_HTTP_AGENT_OPTIONS: { keepAlive?: boolean } | undefined
  var __NEXT_UNDICI_AGENT_SET: boolean
  var __NEXT_HTTP_AGENT: HttpAgent
  var __NEXT_HTTPS_AGENT: HttpsAgent
}

export default next
