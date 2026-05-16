export default function App({ Component, pageProps }) {
  if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    if (!window.renderAttempts) {
      window.renderAttempts = 0
    }
    window.renderAttempts++
    throw new Error('error in custom _app')
  }
  return (
    <>
      <p id="custom-app">from _app</p>
      <Component {...pageProps} />
    </>
  )
}
