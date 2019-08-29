import React from 'react'
import App from 'next/app'
import Link from 'next/link'
import NProgress from 'nprogress'
import Router from 'next/router'

Router.events.on('routeChangeStart', url => {
  console.log(`Loading: ${url}`)
  NProgress.start()
})
Router.events.on('routeChangeComplete', () => NProgress.done())
Router.events.on('routeChangeError', () => NProgress.done())

export default class MyApp extends App {
  render () {
    const { Component, pageProps } = this.props
    return (
      <>
        <div style={{ marginBottom: 20 }}>
          <style jsx>{`
            a {
              margin: 0 10px 0 0;
            }
          `}</style>
          <Link href='/'>
            <a>Home</a>
          </Link>
          <Link href='/about'>
            <a>About</a>
          </Link>
          <Link href='/forever'>
            <a>Forever</a>
          </Link>
          <a href='/non-existing'>Non Existing Page</a>
        </div>

        <Component {...pageProps} />
      </>
    )
  }
}
