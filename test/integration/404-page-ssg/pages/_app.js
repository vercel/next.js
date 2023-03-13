const App = ({ Component, pageProps }) => <Component {...pageProps} />

App.getInitialProps = async ({ Component, ctx }) => {
  let pageProps = {}

  if (Component.getInitialProps) {
    pageProps = await Component.getInitialProps(ctx)
  }
  return {
    pageProps,
  }
}

export default App
