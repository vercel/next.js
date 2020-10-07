import { FacebookPixel } from '../components'

function MyApp({ Component, pageProps }) {
  return (
    <FacebookPixel>
      <Component {...pageProps} />
    </FacebookPixel>
  )
}

export default MyApp
