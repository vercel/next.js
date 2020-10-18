import FacebookPixel from '../components/FacebookPixel'

function MyApp({ Component, pageProps }) {
  return (
    <FacebookPixel>
      <Component {...pageProps} />
    </FacebookPixel>
  )
}

export default MyApp
