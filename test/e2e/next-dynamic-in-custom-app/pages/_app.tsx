import type { AppProps } from 'next/app'
import dynamic from 'next/dynamic'

// Declaring a `ssr: true` dynamic import in `_app` is the common pattern for
// persistent site chrome. Its module id has to end up in
// `__NEXT_DATA__.dynamicIds` so the client waits for the chunk before
// hydrating, otherwise React throws the server rendered markup away.
const AppHeader = dynamic(() => import('../components/app-header'), {
  ssr: true,
  loading: () => <p id="app-header-loading">loading header</p>,
})

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <AppHeader />
      <Component {...pageProps} />
    </>
  )
}
