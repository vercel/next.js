import type { AppProps } from 'next/app'
// Also imported by `pages/index.tsx`, so it is available to the page once `_app` has loaded.
import '../lib/c-shared'

import('../lib/app-dyn')

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
