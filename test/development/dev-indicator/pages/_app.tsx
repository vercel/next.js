import type { AppProps } from 'next/app'
import { Nav } from '../components/nav'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Nav />
      <main>
        <Component {...pageProps} />
      </main>
    </>
  )
}
