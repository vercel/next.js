function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

MyApp.getInitialProps = async ({ Component, ctx }) => {
  // This simulates a custom _app that sets Cache-Control header
  // which should NOT override the ISG page's cache-control
  if (ctx.res) {
    ctx.res.setHeader('Cache-Control', 'public, max-age=3600')
  }

  let pageProps = {}
  if (Component.getInitialProps) {
    pageProps = await Component.getInitialProps(ctx)
  }
  return { pageProps }
}

export default MyApp
