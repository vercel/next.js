import type { AppProps } from 'next/app'
import '../global.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <p id="app-label">original-app</p>
      <Component {...pageProps} />
    </>
  )
}
