import { StoreProvider } from '../lib/zustandProvider'
import { useHydrate } from '../lib/store'

export default function App({ Component, pageProps }) {
  const store = useHydrate(pageProps.initialZustandState)

  return (
    <StoreProvider store={store}>
      <Component {...pageProps} />
    </StoreProvider>
  )
}
