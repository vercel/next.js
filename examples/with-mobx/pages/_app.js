import { useMemo, useEffect } from 'react'
import { Store } from '../store'
import { Provider } from 'mobx-react'

export default function App({ Component, pageProps }) {
  const store = useMemo(() => {
    return new Store()
  }, [])

  useEffect(() => {
    // If your page has Next.js data fetching methods returning a state for the Mobx store,
    // then you can hydrate it here.
    const { initialState } = pageProps
    if (initialState) {
      store.hydrate(initialState)
    }
  }, [store, pageProps])

  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  )
}
