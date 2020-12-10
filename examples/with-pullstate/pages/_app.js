import { PullstateProvider } from 'pullstate'

import { PullstateCore } from '../stores'

export default function App({ Component, pageProps }) {
  const instance =
    typeof window === 'undefined'
      ? PullstateCore.instantiate({ ssr: true })
      : PullstateCore.instantiate({
          ssr: false,
          hydrateSnapshot: pageProps.hydrateSnapshot,
        })

  return (
    <PullstateProvider instance={instance}>
      <Component {...pageProps} />
    </PullstateProvider>
  )
}
