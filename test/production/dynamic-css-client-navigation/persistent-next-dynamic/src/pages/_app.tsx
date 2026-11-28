import type { AppProps } from 'next/app'
import dynamic from 'next/dynamic'

// Stays mounted on every page and uses the same CSS module as `/nodejs` and `/edge`.
const Persistent = dynamic(() => import('../components/persistent'))

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Persistent />
      <Component {...pageProps} />
    </>
  )
}
