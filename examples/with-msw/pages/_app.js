if (process.env.enableApiMocking) {
  require('../mocks')
}

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}
