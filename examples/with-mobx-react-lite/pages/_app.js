import { InjectStoreContext } from '../store'

export default function App({ Component, pageProps }) {
  // If your page has Next.js data fetching methods returning a state for the Mobx store,
  // then you can hydrate it here.
  return (
    <InjectStoreContext initialData={pageProps.initialStoreData}>
      <Component {...pageProps} />
    </InjectStoreContext>
  )
}
