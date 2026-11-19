import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div id="custom-app">
      <Component {...pageProps} />
    </div>
  )
}
