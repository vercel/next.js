/* eslint-disable react/jsx-props-no-spreading */
import * as React from 'react'
import type { AppProps } from 'next/app'
import { ApolloProvider } from '@apollo/client'

import { useApollo } from '@lib/Apollo'

const WebApp = ({ Component, pageProps }: AppProps): JSX.Element => {
  const apolloClient = useApollo(pageProps.initialApolloState)

  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
    </ApolloProvider>
  )
}

export default WebApp
