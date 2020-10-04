import FelaProvider from '../FelaProvider'

function MyApp({ Component, pageProps, renderer }) {
  return (
    <FelaProvider renderer={renderer}>
      <Component {...pageProps} />
    </FelaProvider>
  )
}

export default MyApp
