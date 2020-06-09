import { createEnvironment } from '../lib/createEnvironment'

export default function App({ Component, pageProps }) {
  const environment = createEnvironment(pageProps.records)
  return <Component {...pageProps} environment={environment} />
}
