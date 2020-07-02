import App from 'next/app'

async function fetchSomething() {
  return {}
}

class NextApp extends App {
  static async getInitialProps({ Component, ctx }) {
    let pageProps = {}
    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }
    const data = await fetchSomething()
    return { pageProps, data }
  }

  render() {
    const { Component, pageProps } = this.props

    return <Component {...pageProps} />
  }
}

export default NextApp
