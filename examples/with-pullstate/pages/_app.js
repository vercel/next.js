import { PullstateProvider } from 'pullstate'

import { useHydrate } from '../stores'

export default function App({ Component, pageProps }) {
  const instance = useHydrate(pageProps.snapshot)

  return (
    <PullstateProvider instance={instance}>
      <Component {...pageProps} />
    </PullstateProvider>
  )
}
