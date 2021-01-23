function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}

if (typeof window !== 'undefined') {
  window.uncaughtErrors = []
  window.addEventListener('error', (err) => {
    window.uncaughtErrors.push(err)
  })
  window.addEventListener('unhandledrejection', (err) => {
    window.uncaughtErrors.push(err)
  })
}

App.getInitialProps = async ({ Component, ctx }) => {
  const props = {}

  if (Component.getInitialProps) {
    props.initialProps = await Component.getInitialProps(ctx)
  }
  return props
}

export default App
