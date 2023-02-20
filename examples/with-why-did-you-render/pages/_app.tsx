import { AppProps } from 'next/app'
import '../scripts/wdyr'

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
