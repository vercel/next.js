import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/core'
import { globalStyles } from '../shared/styles'

const cache = createCache()

const App = ({ Component, pageProps }) => (
  <CacheProvider value={cache}>
    {globalStyles}
    <Component {...pageProps} />
  </CacheProvider>
)

export default App
