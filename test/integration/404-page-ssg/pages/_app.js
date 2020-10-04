const App = ({ Component, pageProps }) => <Component {...pageProps} />

App.getInitialProps = async ({ Component, ctx }) => {
  if (Component.getInitialProps) {
    await Component.getInitialProps(ctx)
  }
  return {
    pageProps: {},
  }
}

export default App
