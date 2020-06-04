import { Provider } from 'react-redux'
import { ApolloProvider } from '@apollo/react-hooks'
import { getDataFromTree } from '@apollo/react-ssr'
import { initializeApollo } from './apollo'
import { initializeStore } from './redux'

export default async function getApolloState(
  Page,
  reduxStore = initializeStore()
) {
  const apolloClient = initializeApollo()

  // Take a Next.js page, determine which queries are needed to render,
  // and fetch them. This method can be pretty slow since it renders
  // your entire page once for every query. Check out Apollo fragments
  // if you want to reduce the number of rerenders.
  // https://www.apollographql.com/docs/react/data/fragments/
  await getDataFromTree(
    <Provider store={reduxStore}>
      <ApolloProvider client={apolloClient}>
        <Page />
      </ApolloProvider>
    </Provider>
  )

  return apolloClient.cache.extract()
}
