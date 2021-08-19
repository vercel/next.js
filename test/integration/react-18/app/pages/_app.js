import { PromiseCacheProvider } from '../components/promise-cache'

const cache = new Map()

function MyApp({ Component, pageProps }) {
  return (
    <PromiseCacheProvider value={cache}>
      <Component {...pageProps} />
    </PromiseCacheProvider>
  )
}

export default MyApp
