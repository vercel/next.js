import type { AppProps } from 'next/app'
import '../style/index.css'

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

export default MyApp
