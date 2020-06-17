/* eslint-disable import/no-extraneous-dependencies */

/// <reference types="node" />
/// <reference types="react" />
/// <reference types="react-dom" />

import React from 'react'
import { ParsedUrlQuery } from 'querystring'
import { IncomingMessage, ServerResponse } from 'http'
import { Configuration as WebpackConfig } from 'webpack'
import { Options as WebpackDevOptions } from 'webpack-dev-middleware'

import {
  NextPageContext,
  NextComponentType,
  NextApiResponse,
  NextApiRequest,
  NextApiHandler,
  // @ts-ignore This path is generated at build time and conflicts otherwise
} from '../dist/next-server/lib/utils'

// @ts-ignore This path is generated at build time and conflicts otherwise
import next from '../dist/server/next'

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

  // <style jsx> and <style jsx global> support for styled-jsx
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean
    global?: boolean
  }
}

/**
 * `Page` type, use it as a guide to create `pages`.
 */
export type NextPage<P = {}, IP = P> = NextComponentType<NextPageContext, IP, P>

/**
 * `Config` type, use it for export const config
 */
export type PageConfig = {
  amp?: boolean | 'hybrid'
  api?: {
    /**
     * The byte limit of the body. This is the number of bytes or any string
     * format supported by `bytes`, for example `1000`, `'500kb'` or `'3mb'`.
     */
    bodyParser?: { sizeLimit?: number | string } | false
    /**
     * Flag to disable warning "API page resolved
     * without sending a response", due to explicitly
     * using an external API resolver, like express
     */
    externalResolver?: true
  }
  env?: Array<string>
  unstable_runtimeJS?: false
}

export {
  NextPageContext,
  NextComponentType,
  NextApiResponse,
  NextApiRequest,
  NextApiHandler,
}

export type GetStaticPropsContext<Q extends ParsedUrlQuery = ParsedUrlQuery> = {
  params?: Q
  preview?: boolean
  previewData?: any
}

export type GetStaticPropsResult<P> = {
  props: P
  unstable_revalidate?: number | boolean
}

export type GetStaticProps<
  P extends { [key: string]: any } = { [key: string]: any },
  Q extends ParsedUrlQuery = ParsedUrlQuery
> = (context: GetStaticPropsContext<Q>) => Promise<GetStaticPropsResult<P>>

export type InferGetStaticPropsType<T> = T extends GetStaticProps<infer P, any>
  ? P
  : T extends (
      context?: GetStaticPropsContext<any>
    ) => Promise<GetStaticPropsResult<infer P>>
  ? P
  : never

export type GetStaticPaths<
  P extends ParsedUrlQuery = ParsedUrlQuery
> = () => Promise<{
  paths: Array<string | { params: P }>
  fallback: boolean
}>

export type GetServerSidePropsContext<
  Q extends ParsedUrlQuery = ParsedUrlQuery
> = {
  req: IncomingMessage
  res: ServerResponse
  params?: Q
  query: ParsedUrlQuery
  preview?: boolean
  previewData?: any
}

export type GetServerSidePropsResult<P> = {
  props: P
}

export type GetServerSideProps<
  P extends { [key: string]: any } = { [key: string]: any },
  Q extends ParsedUrlQuery = ParsedUrlQuery
> = (
  context: GetServerSidePropsContext<Q>
) => Promise<GetServerSidePropsResult<P>>

export type InferGetServerSidePropsType<T> = T extends GetServerSideProps<
  infer P,
  any
>
  ? P
  : T extends (
      context?: GetServerSidePropsContext<any>
    ) => Promise<GetServerSidePropsResult<infer P>>
  ? P
  : never

interface NextConfigObject {
  env?: Record<string, string>
  webpack?: (
    config: WebpackConfig,
    info: {
      buildId: string
      dev: boolean
      isServer: boolean
      defaultLoaders: object
    }
  ) => WebpackConfig
  webpackDevMiddleware?: (config: WebpackDevOptions) => WebpackDevOptions
  distDir?: string
  assetPrefix?: string
  configOrigin?: string
  useFileSystemPublicRoutes?: boolean
  generateBuildId?: () => Promise<string> | string
  generateEtags?: boolean
  pageExtensions?: string[]
  target?: 'server' | 'serverless'
  poweredByHeader?: boolean
  compress?: boolean
  devIndicators?: {
    autoPrerender?: boolean
    buildActivity?: boolean
  }
  onDemandEntries?: { maxInactiveAge?: number; pagesBufferLength?: number }
  amp?: {
    canonicalBase?: string
  }
  exportTrailingSlash?: boolean
  sassOptions?: Record<string, any>
  experimental?: {
    cpus?: number
    modern?: boolean
    plugins?: boolean
    profiling?: boolean
    sprFlushToDisk?: boolean
    reactMode?: 'legacy' | 'blocking' | 'concurrent'
    workerThreads?: false
    basePath?: string
    pageEnv?: boolean
    productionBrowserSourceMaps?: boolean
    optionalCatchAll?: boolean
  }
  future?: {
    excludeDefaultMomentLocales?: boolean
  }
  serverRuntimeConfig?: Record<string, any>
  publicRuntimeConfig?: Record<string, any>
  reactStrictMode?: boolean
  typescript?: {
    ignoreBuildErrors?: boolean
  }
  exportPathMap?: (
    defaultPathMap: Record<
      string,
      { page: string; query?: Record<string, string> }
    >,
    info: {
      dev: boolean
      dir: string
      outDir: string
      distDir: string
      buildId: string
    }
  ) => Promise<Record<string, { page: string; query?: Record<string, string> }>>
}

export type NextConfig =
  | NextConfigObject
  | ((
      phase:
        | 'phase-export'
        | 'phase-production-build'
        | 'phase-production-server'
        | 'phase-development-server',
      defaultConfig: {
        defaultConfig: {
          env: []
          webpack: null
          webpackDevMiddleware: null
          distDir: '.next'
          assetPrefix: ''
          configOrigin: 'default'
          useFileSystemPublicRoutes: true
          generateBuildId: () => null
          generateEtags: true
          pageExtensions: ['tsx', 'ts', 'jsx', 'js']
          target: 'server'
          poweredByHeader: true
          compress: true
          devIndicators: {
            buildActivity: true
            autoPrerender: true
          }
          onDemandEntries: {
            maxInactiveAge: 60000
            pagesBufferLength: 2
          }
          amp: {
            canonicalBase: ''
          }
          exportTrailingSlash: false
          sassOptions: {}
          experimental: {
            cpus: number
            modern: false
            plugins: false
            profiling: false
            sprFlushToDisk: true
            reactMode: 'legacy'
            workerThreads: false
            basePath: ''
            pageEnv: false
            productionBrowserSourceMaps: false
            optionalCatchAll: false
          }
          future: {
            excludeDefaultMomentLocales: false
          }
          serverRuntimeConfig: {}
          publicRuntimeConfig: {}
          reactStrictMode: false
        }
      }
    ) => NextConfigObject)

export default next
