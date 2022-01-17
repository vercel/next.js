import App from 'next/app'

class MyApp extends App {
  static async getInitialProps(ctx) {
    const { req, query, pathname, asPath } = ctx.ctx
    let pageProps = {}

    if (ctx.Component.getInitialProps) {
      pageProps = await ctx.Component.getInitialProps(ctx.ctx)
    }

    return {
      appProps: {
        url: (req || {}).url,
        query,
        pathname,
        asPath,
      },
      pageProps,
    }
  }

  render() {
    const { Component, pageProps, appProps } = this.props
    return <Component {...pageProps} appProps={appProps} />
  }
}

export default MyApp
