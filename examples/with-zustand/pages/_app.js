import { useCreateStore, Provider } from '../lib/store'

export default function App({ Component, pageProps }) {
  const createStore = useCreateStore(pageProps.initialZustandState)
  return (
    <Provider createStore={createStore}>
      <Component {...pageProps} />
    </Provider>
  )
}
