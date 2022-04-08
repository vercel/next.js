import type { AppProps } from 'next/app'
import '../style/index.css'

function MyApp({ Component, pageProps }: any) {
  return <Component {...pageProps} />
}

export default MyApp
