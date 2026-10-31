import type { AppProps } from 'next/app'
import dynamic from 'next/dynamic'
import { appShared } from '../components/app-shared'

const Lazy = dynamic(() => import('../components/lazy').then((m) => m.Lazy))

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <p id="app">{appShared('app')}</p>
      <Lazy />
      <Component {...pageProps} />
    </>
  )
}
