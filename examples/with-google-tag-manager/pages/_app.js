import GoogleTagManager from '../components/GoogleTagManager'

function MyApp({ Component, pageProps }) {
  return (
    <GoogleTagManager>
      <Component {...pageProps} />
    </GoogleTagManager>
  )
}

export default MyApp
