import { useHydrate, Provider } from '../lib/store'

export default function App({ Component, pageProps }) {
  const store = useHydrate(pageProps.initialZustandState)
  return (
    <Provider initialStore={store}>
      <Component {...pageProps} />
    </Provider>
  )
}
