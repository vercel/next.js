import '../styles/globals.css'

import App from 'next/app'
import Head from 'next/head'
import { HelmetProvider } from 'react-helmet-async'

class MyApp extends App {
  helmetContext = {}

  render() {
    const { Component, pageProps } = this.props
    return (
      <HelmetProvider context={this.helmetContext}>
        <Head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
        <Component {...pageProps} helmetContext={this.helmetContext} />
      </HelmetProvider>
    )
  }
}

export default MyApp
