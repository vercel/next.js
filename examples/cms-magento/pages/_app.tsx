import { AppProps } from 'next/app'
import { ApolloProvider } from '@apollo/react-hooks'
import { Provider } from 'react-redux'
import { persistStore } from 'redux-persist'
import { PersistGate } from 'redux-persist/integration/react'
import NProgress from 'nprogress'
import Router from 'next/router'

import { useApollo } from 'lib/apolloClient'
import { useStore } from '../lib/redux/redux'

import 'react-toastify/dist/ReactToastify.css'
import '../public/styles/nprogress.css'

Router.events.on('routeChangeStart', (url) => {
  console.log(`Loading: ${url}`)
  NProgress.start()
})
Router.events.on('routeChangeComplete', () => NProgress.done())
Router.events.on('routeChangeError', () => NProgress.done())

export default function App({ Component, pageProps }: AppProps) {
  const apolloClient = useApollo(pageProps.initialApolloState)

  const store = useStore(pageProps.initialReduxState)
  const persistor = persistStore(store)

  return (
    <Provider store={store}>
      <ApolloProvider client={apolloClient}>
        <PersistGate
          loading={<Component {...pageProps} />}
          persistor={persistor}
        >
          <Component {...pageProps} />
        </PersistGate>
      </ApolloProvider>
    </Provider>
  )
}
