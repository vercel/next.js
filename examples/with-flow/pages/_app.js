import App from 'next/app'
import Link from 'next/link'
import React from 'react'

export default class MyApp extends App {
  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render () {
    const { Component, pageProps } = this.props
    return (
      <>
        <header>
          <nav>
            <Link href='/'>
              <a>Home</a>
            </Link>
            |
            <Link href='/about'>
              <a>About</a>
            </Link>
            |
            <Link href='/contact'>
              <a>Contact</a>
            </Link>
          </nav>
        </header>

        <Component {...pageProps} />

        <footer>I`m here to stay</footer>
      </>
    )
  }
}
