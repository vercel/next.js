import React from 'react'
import Head from 'next/head'

import Header from '../components/Header'
import { getUserFromCookie, getUserFromLocalStorage } from '../utils/auth'

export default Page => class DefaultPage extends React.Component {
  static getInitialProps (ctx) {
    const loggedUser = process.browser ? getUserFromLocalStorage() : getUserFromCookie(ctx.req)
    const pageProps = Page.getInitialProps && Page.getInitialProps(ctx)
    return {
      ...pageProps,
      loggedUser,
      currentUrl: ctx.pathname,
      isAuthenticated: !!loggedUser
    }
  }

  constructor (props) {
    super(props)

    this.logout = this.logout.bind(this)
  }

  logout (eve) {
    if (eve.key === 'logout') {
      this.props.url.pushTo(`/?logout=${eve.newValue}`)
    }
  }

  componentDidMount () {
    window.addEventListener('storage', this.logout, false)
  }

  componentWillUnmount () {
    window.removeEventListener('storage', this.logout, false)
  }

  render () {
    return (
      <div>
        <Head>
          <meta name='viewport' content='width=device-width, initial-scale=1' />
          <link href='https://unpkg.com/normalize.css@5.0.0/normalize.css' rel='stylesheet' />
          <title>Next.js + auth0</title>
        </Head>
        <div className='app'>
          <div>
            <Header {...this.props} />
            <Page {...this.props} />
          </div>
        </div>
        <style jsx>{`
          .app {
            height: 100vh;
            width: 100vw;
          }

          .app div {
            max-width: 1024px;
            margin: 0 auto;
            padding: 30px;
          }
        `}</style>
        <style jsx global>{`
          * {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif;
          }
        `}</style>
      </div>
    )
  }
}
