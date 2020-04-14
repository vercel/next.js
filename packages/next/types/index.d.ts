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
  }
  env?: Array<string>
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

export type StaticProps<
  T,
  Q extends ParsedUrlQuery = ParsedUrlQuery
> = T extends (
  context?: GetStaticPropsContext<Q>
) => Promise<GetStaticPropsResult<infer P>>
  ? GetStaticPropsResult<P>['props']
  : never

export type GetStaticPaths<
  P extends ParsedUrlQuery = ParsedUrlQuery
> = () => Promise<{
  paths: Array<string | { params: P }>
  fallback: boolean
}>

export type GetServerSidePropsContext<Q> = {
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

export type ServerSideProps<
  T,
  Q extends ParsedUrlQuery = ParsedUrlQuery
> = T extends (
  context?: GetServerSidePropsContext<Q>
) => Promise<GetServerSidePropsResult<infer P>>
  ? GetServerSidePropsResult<P>['props']
  : never

export default next
