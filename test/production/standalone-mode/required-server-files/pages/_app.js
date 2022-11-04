import { setConfig } from '../lib/config'

setConfig({ hello: 'world' })

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}
