import App, { Container } from 'next/app'
import { ApolloProvider } from 'react-apollo'
import { Provider } from 'unstated'
import { dataContainer } from '../src/utils/unstated'
import withApollo from '../src/utils/withApollo'

let dataStore = new dataContainer()
class MyApp extends App {
  render() {
    const { Component, pageProps, apolloClient } = this.props
    return (
      <Container>
        <ApolloProvider client={apolloClient}>
          <Provider inject={[dataStore]}>
            <Component {...pageProps} />
          </Provider>
        </ApolloProvider>
      </Container>
    )
  }
}

export default withApollo(MyApp)
