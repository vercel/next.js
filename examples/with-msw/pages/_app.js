// Enable API mocking in all environments except production.
// This is recommended for real-world apps.
if (process.env.NODE_ENV !== 'production') {
  require('../mocks')
}

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}
