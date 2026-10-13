function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

MyApp.getInitialProps = async ({ ctx }) => {
  // Simulate an app that incidentally sets a Cache-Control header in
  // `_app`'s `getInitialProps`, unrelated to the page's own ISR config.
  ctx.res?.setHeader('Cache-Control', 'no-store')
  return {}
}

export default MyApp
