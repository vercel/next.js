import '../styles/globals.css'
import '../styles/globals.scss'

/** @param {import('next/app').AppProps} props */
function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
