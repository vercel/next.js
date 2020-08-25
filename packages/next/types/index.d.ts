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

export type GetStaticPropsContext<P extends ParsedUrlQuery = ParsedUrlQuery> = {
  params?: P
  preview?: boolean
  previewData?: any
}

export type GetStaticPropsResult<Props> = {
  props: Props
  revalidate?: number | boolean
}

/**
 * @template Props shape of server side props
 * @template Q shape of the query parameters
 * @template P shape of path parameters
 */
export type GetStaticProps<
  Props extends { [key: string]: any } = { [key: string]: any },
  P extends ParsedUrlQuery = ParsedUrlQuery,
  Q extends ParsedUrlQuery = ParsedUrlQuery
> = (context: GetStaticPropsContext<Q>) => Promise<GetStaticPropsResult<Props>>

export type InferGetStaticPropsType<T> = T extends GetStaticProps<infer Props, any, any>
  ? Props
  : T extends (
      context?: GetStaticPropsContext<any>
    ) => Promise<GetStaticPropsResult<infer Props>>
  ? Props
  : never

export type GetStaticPaths<
  P extends ParsedUrlQuery = ParsedUrlQuery
> = () => Promise<{
  paths: Array<string | { params: P }>
  fallback: boolean | 'unstable_blocking'
}>

/**
 * @template P shape of path parameters
 * @template Q shape of the query parameters
 */
export type GetServerSidePropsContext<
  P extends ParsedUrlQuery = ParsedUrlQuery,
  Q extends ParsedUrlQuery = ParsedUrlQuery
> = {
  req: IncomingMessage
  res: ServerResponse
  params?: P
  query: Q
  preview?: boolean
  previewData?: any
}

/**
 * @template Props shape of server side props
 */
export type GetServerSidePropsResult<Props> = {
  props: Props
}

/**
 * @template Props shape of server side props
 * @template Q shape of the query parameters
 * @template P shape of path parameters
 */
export type GetServerSideProps<
  Props extends { [key: string]: any } = { [key: string]: any },
  P extends ParsedUrlQuery = ParsedUrlQuery,
  Q extends ParsedUrlQuery = ParsedUrlQuery
> = (
  context: GetServerSidePropsContext<P, Q>
) => Promise<GetServerSidePropsResult<Props>>

export type InferGetServerSidePropsType<T> = T extends GetServerSideProps<
  infer P,
  any,
  any
>
  ? P
  : T extends (
      context?: GetServerSidePropsContext<any>
    ) => Promise<GetServerSidePropsResult<infer P>>
  ? P
  : never

export default next
