import { PullstateProvider } from 'pullstate'

import { PullstateCore } from '../stores'

export default function App({ Component, pageProps }) {
  const instance = pageProps.snapshot
    ? PullstateCore.instantiate({
        hydrateSnapshot: JSON.parse(pageProps.snapshot),
      })
    : PullstateCore.instantiate()

  return (
    <PullstateProvider instance={instance}>
      <Component {...pageProps} />
    </PullstateProvider>
  )
}
