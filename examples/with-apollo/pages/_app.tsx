import type { AppProps } from 'next/app'
import { ApolloProvider } from '@apollo/client'
import { type PagePropsWithApolloState, useApollo } from '@/lib/apolloClient'

export default function App({
  Component,
  pageProps,
}: AppProps<PagePropsWithApolloState>) {
  const apolloClient = useApollo(pageProps)

  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
    </ApolloProvider>
  )
}
