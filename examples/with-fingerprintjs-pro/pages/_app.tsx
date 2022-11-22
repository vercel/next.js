import { useRouter } from 'next/router'
import Head from 'next/head'
import '../styles/globals.css'
import '../styles/App.css'
import { InMemoryCache } from '../providers/InMemoryCache'
import { LocalStorageCache } from '../providers/LocalStorageCache'
import { WithoutCache } from '../providers/WithoutCache'
import { SessionStorageCache } from '../providers/SessionStorageCache'
import { CacheStrategySelector } from '../components/CacheStrategySelector'
import { Nav } from '../components/Nav'
import type { AppProps } from 'next/app'
import type { CacheStrategyPath, RouterProps } from '../components/types'

const getFingerprintJsProProviderByCacheStrategy = (
  cacheStrategy: CacheStrategyPath
) => {
  switch (cacheStrategy) {
    case 'no-cache':
      return WithoutCache
    case 'ls-cache':
      return LocalStorageCache
    case 'session-storage-cache':
      return SessionStorageCache
    default:
      return InMemoryCache
  }
}

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const { cacheStrategy } = router.query as RouterProps

  const ConfiguredFingerprintJsProProvider =
    getFingerprintJsProProviderByCacheStrategy(cacheStrategy)

  return (
    <div className="layout">
      <Head>
        <title>FingerprintJs Pro example for Next.js</title>
      </Head>
      <CacheStrategySelector />
      <main>
        <ConfiguredFingerprintJsProProvider>
          <Nav />
          <Component {...pageProps} />
        </ConfiguredFingerprintJsProProvider>
      </main>
    </div>
  )
}

export default MyApp
