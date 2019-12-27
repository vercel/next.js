import sideEffect from '../sideEffectModule'

sideEffect('_app')

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
