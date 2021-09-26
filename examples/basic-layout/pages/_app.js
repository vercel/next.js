function MyApp({ Layout, layoutProps, Component, pageProps }) {
  console.log('RENDERING MYAPP')
  if (!Layout) {
    return 'INVALID LAYOUT!'
  }

  return (
    <Layout {...layoutProps}>
      <Component {...pageProps} />
    </Layout>
  )
}

export default MyApp
