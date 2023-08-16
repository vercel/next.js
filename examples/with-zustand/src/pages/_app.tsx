import StoreProvider from '@/lib/StoreProvider'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <StoreProvider {...pageProps.initialZustandState}>
      <Component {...pageProps} />
    </StoreProvider>
  )
}
