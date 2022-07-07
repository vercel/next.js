import { log } from 'next-axiom'
import { AppProps } from 'next/app'
export { reportWebVitals } from 'next-axiom'

log.info('Hello from frontend', { foo: 'bar' })

type props = {}

const MyApp = ({ Component, pageProps }: AppProps) => {
  return <Component {...pageProps} />
}

export default MyApp
