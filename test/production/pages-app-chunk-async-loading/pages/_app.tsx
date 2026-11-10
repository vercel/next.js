import type { AppProps } from 'next/app'
import { sharedLabel } from '../shared'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <p id="app">{sharedLabel('app')}</p>
      <Component {...pageProps} />
    </>
  )
}
