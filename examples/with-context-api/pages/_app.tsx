import type { AppProps } from 'next/app'
import { CounterProvider } from '../components/Counter'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <CounterProvider>
      <Component {...pageProps} />
    </CounterProvider>
  )
}
