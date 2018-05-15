import App, {Container} from 'next/app'
import Link from 'next/link'
import React from 'react'

import '../styles/global.scss'

export default class MyApp extends App {
  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return {pageProps}
  }

  render () {
    const {Component, pageProps} = this.props
    return (
      <Container>
        <header>
          <Link href='/'>
            <a>
              <img src='/static/sample-logo.png' alt='logo' height={100} />
            </a>
          </Link>
          Common Header
        </header>
        <section id='main'>
          <Component {...pageProps} />
        </section>
        <footer>
          <Link href='/'>Home</Link>
          <Link href='/privacy'>Privacy Policy</Link>
        </footer>
      </Container>
    )
  }
}
