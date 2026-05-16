export default function App({ Component, pageProps }) {
  if (!pageProps || typeof pageProps !== 'object') {
    throw new Error(
      `Invariant: received invalid pageProps in _app, received ${pageProps}`
    )
  }
  return <Component {...pageProps} />
}
