/// <reference types="node" />
/// <reference types="react" />
/// <reference types="react-dom" />

import React from 'react'
import { ParsedUrlQuery } from 'querystring'
import { IncomingMessage, ServerResponse } from 'http'

import {
  NextPageContext,
  NextComponentType,
  NextApiResponse,
  NextApiRequest,
  NextApiHandler,
  // @ts-ignore This path is generated at build time and conflicts otherwise
} from '../dist/shared/lib/utils'

import {
  NextApiRequestCookies,
  // @ts-ignore This path is generated at build time and conflicts otherwise
} from '../dist/server/api-utils'

// @ts-ignore This path is generated at build time and conflicts otherwise
import next from '../dist/server/next'

export type ServerRuntime = 'nodejs' | 'experimental-edge' | 'edge' | undefined

// @ts-ignore This path is generated at build time and conflicts otherwise
export { NextConfig } from '../dist/server/config'

// @ts-ignore This path is generated at build time and conflicts otherwise
export { Metadata } from '../dist/lib/metadata/types/metadata-interface'

// Extend the React types with missing properties
declare module 'react' {
  // <html amp=""> support
  interface HtmlHTMLAttributes<T> extends React.HTMLAttributes<T> {
    amp?: string
  }

  // <link nonce=""> support
  interface LinkHTMLAttributes<T> extends HTMLAttributes<T> {
    nonce?: string
  }

  function use<T>(promise: Promise<T> | React.Context<T>): T
  function cache<T extends Function>(fn: T): T
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
 * `Page` type, use it as a guide to create `pages`.
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

export type GetStaticPropsContext<
  Params extends ParsedUrlQuery = ParsedUrlQuery,
  Preview extends PreviewData = PreviewData
> = {
  params?: Params
  preview?: boolean
  previewData?: Preview
  locale?: string
  locales?: string[]
  defaultLocale?: string
}

export type GetStaticPropsResult<Props> =
  | { props: Props; revalidate?: number | boolean }
  | { redirect: Redirect; revalidate?: number | boolean }
  | { notFound: true; revalidate?: number | boolean }

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

export type GetStaticPathsResult<
  Params extends ParsedUrlQuery = ParsedUrlQuery
> = {
  paths: Array<string | { params: Params; locale?: string }>
  fallback: boolean | 'blocking'
}

export type GetStaticPaths<Params extends ParsedUrlQuery = ParsedUrlQuery> = (
  context: GetStaticPathsContext
) => Promise<GetStaticPathsResult<Params>> | GetStaticPathsResult<Params>

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
  resolvedUrl: string
  locale?: string
  locales?: string[]
  defaultLocale?: string
}

export type GetServerSidePropsResult<Props> =
  | { props: Props | Promise<Props> }
  | { redirect: Redirect }
  | { notFound: true }

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
}

export default next
