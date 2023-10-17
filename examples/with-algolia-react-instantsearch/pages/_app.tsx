import type { AppProps } from 'next/app'
import 'instantsearch.css/themes/algolia.css'
import '../styles/global.css'

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
