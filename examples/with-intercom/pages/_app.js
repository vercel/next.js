import '../styles/globals.css'
import { IntercomProvider } from '../util/IntercomProvider'

function MyApp({ Component, pageProps }) {
  return (
    <IntercomProvider>
      <Component {...pageProps} />
    </IntercomProvider>
  )
}

export default MyApp
