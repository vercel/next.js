import { ApolloProvider } from '@apollo/react-hooks'
import ReactDOMServer from 'react-dom/server'
import createApolloClient from '../apolloClient'

export default async function renderWithApollo(Page) {
  const apolloClient = createApolloClient(Page.initialApolloState)
  const { getDataFromTree } = await import('@apollo/react-ssr')

  ReactDOMServer.renderToString(
    await getDataFromTree(
      <ApolloProvider client={apolloClient}>
        <Page />
      </ApolloProvider>
    )
  )
}
