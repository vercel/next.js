import { PromiseCacheProvider } from '../components/promise-cache'

function MyApp({ Component, pageProps }) {
  return (
    <PromiseCacheProvider value={new Map()}>
      <Component {...pageProps} />
    </PromiseCacheProvider>
  )
}

export default MyApp
