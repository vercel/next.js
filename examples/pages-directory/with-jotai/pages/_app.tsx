import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { Provider } from 'jotai'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Provider>
      <Component {...pageProps} />
    </Provider>
  )
}
