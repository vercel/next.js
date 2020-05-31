import { ApolloClient } from 'apollo-client'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { HttpLink } from 'apollo-link-http'
import ReactDOMServer from 'react-dom/server'

function createApolloClient(initialState = {}) {
  return new ApolloClient({
    ssrMode: false,
    link: new HttpLink({
      uri: 'https://api.graph.cool/simple/v1/cixmkt2ul01q00122mksg82pn',
      credentials: 'same-origin',
    }),
    cache: new InMemoryCache().restore(initialState),
  })
}

async function renderWithApollo(Page) {
  const apolloClient = createApolloClient(Page.initialApolloState)
  const { ApolloProvider } = await import('@apollo/react-hooks')
  const { getDataFromTree } = await import('@apollo/react-ssr')

  ReactDOMServer.renderToString(
    await getDataFromTree(
      <ApolloProvider client={apolloClient}>
        <Page />
      </ApolloProvider>
    )
  )
}

export { createApolloClient, renderWithApollo }
