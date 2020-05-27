import { IncomingMessage, ServerResponse } from 'http'
import { NextPage, NextPageContext } from 'next'
import { ContextFunction } from 'apollo-server-core'
import React from 'react'
import Head from 'next/head'
import { ApolloProvider } from '@apollo/react-hooks'
import { ApolloClient } from 'apollo-client'
import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory'

type TApolloClient = ApolloClient<NormalizedCacheObject>

type InitialProps = {
  apolloClient: TApolloClient
  apolloState: any
} & Record<string, any>

type WithApolloPageContext = {
  apolloClient: TApolloClient
} & NextPageContext

export type ResolverContext = { req: IncomingMessage; res: ServerResponse }

let globalApolloClient: TApolloClient

export const createResolverContext: ContextFunction<
  { req: IncomingMessage; res: ServerResponse },
  ResolverContext
> = async ({ req, res }) => {
  // If you want to pass additional data to resolvers as context
  // such as session data, you can do it here. For example:
  //
  //    const user = await resolveUser(req.header.cookie)
  //    return { req, res, user }
  //
  return { req, res }
}

/**
 * Creates and provides the apolloContext
 * to a next.js PageTree. Use it by wrapping
 * your PageComponent via HOC pattern.
 * By passing `{ssr: false}`, it could be statically optimized
 * instead of being exported as a serverless function.
 */
export default function withApollo(
  PageComponent: NextPage,
  { ssr = true } = {}
) {
  const WithApollo = ({
    apolloClient,
    apolloState,
    ...pageProps
  }: InitialProps) => {
    const client = apolloClient || initApolloClient(apolloState)
    return (
      <ApolloProvider client={client}>
        <PageComponent {...pageProps} />
      </ApolloProvider>
    )
  }

  // Set the correct displayName in development
  if (process.env.NODE_ENV !== 'production') {
    const displayName =
      PageComponent.displayName || PageComponent.name || 'Component'

    if (displayName === 'App') {
      console.warn('This withApollo HOC only works with PageComponents.')
    }

    WithApollo.displayName = `withApollo(${displayName})`
  }

  if (ssr || PageComponent.getInitialProps) {
    WithApollo.getInitialProps = async (ctx: WithApolloPageContext) => {
      // Resolver context here is only set on server. For client-side,
      // "/api/graphql" route creates and pass it to resolver functions.
      let resolverContext: ResolverContext | undefined
      // Keep the "isServer" check inline, so webpack removes the block
      // for client-side bundle.
      if (typeof window === 'undefined') {
        resolverContext = await createResolverContext({
          req: ctx.req!,
          res: ctx.res!,
        })
      }

      // Initialize ApolloClient, add it to the ctx object so
      // we can use it in `PageComponent.getInitialProp`.
      const apolloClient = (ctx.apolloClient = initApolloClient(
        undefined,
        resolverContext
      ))

      // Run wrapped getInitialProps methods
      let pageProps = {}
      if (PageComponent.getInitialProps) {
        pageProps = await PageComponent.getInitialProps(ctx)
      }

      // Only on the server:
      if (typeof window === 'undefined') {
        // When redirecting, the response is finished.
        // No point in continuing to render
        if (ctx.res && ctx.res.finished) {
          return pageProps
        }

        // Only if ssr is enabled
        if (ssr) {
          try {
            const { AppTree } = ctx
            // Run all GraphQL queries
            const { getDataFromTree } = await import('@apollo/react-ssr')
            await getDataFromTree(
              <AppTree
                pageProps={{
                  ...pageProps,
                  apolloClient,
                }}
              />
            )
          } catch (error) {
            // Prevent Apollo Client GraphQL errors from crashing SSR.
            // Handle them in components via the data.error prop:
            // https://www.apollographql.com/docs/react/api/react-apollo.html#graphql-query-data-error
            console.error('Error while running `getDataFromTree`', error)
          }

          // getDataFromTree does not call componentWillUnmount
          // head side effect therefore need to be cleared manually
          Head.rewind()
        }
      }

      // Extract query data from the Apollo store
      const apolloState = apolloClient.cache.extract()

      return {
        ...pageProps,
        apolloState,
      }
    }
  }

  return WithApollo
}

/**
 * Always creates a new apollo client on the server
 * Creates or reuses apollo client in the browser.
 */
function initApolloClient(
  initialState?: any,
  resolverContext?: ResolverContext
) {
  // Make sure to create a new client for every server-side request so that data
  // isn't shared between connections (which would be bad)
  if (typeof window === 'undefined') {
    return createApolloClient(initialState, resolverContext)
  }

  // Reuse client on the client-side
  if (!globalApolloClient) {
    globalApolloClient = createApolloClient(initialState)
  }

  return globalApolloClient
}

/**
 * Creates and configures the ApolloClient
 */
function createApolloClient(
  initialState = {},
  resolverContext?: ResolverContext
) {
  const ssrMode = typeof window === 'undefined'
  const cache = new InMemoryCache().restore(initialState)

  // Check out https://github.com/vercel/next.js/pull/4611 if you want to use the AWSAppSyncClient
  return new ApolloClient({
    ssrMode,
    link: createIsomorphLink(resolverContext),
    cache,
  })
}

function createIsomorphLink(resolverContext?: ResolverContext) {
  if (typeof window === 'undefined') {
    const { SchemaLink } = require('apollo-link-schema')
    const schema = require('./schema').default

    // "resolverContext" is passed only before calling "getDataFromTree".
    return new SchemaLink({ schema, context: resolverContext })
  } else {
    const { HttpLink } = require('apollo-link-http')
    return new HttpLink({
      uri: '/api/graphql',
      credentials: 'same-origin',
    })
  }
}
