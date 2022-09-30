import type { AppProps } from 'next/app'

import '../public/globals.css'

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
