import { Provider } from '../lib/zustandProvider'
import { useHydrate } from '../store'

export default function App({ Component, pageProps }) {
  const store = useHydrate(pageProps.initialZustandState)

  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  )
}
