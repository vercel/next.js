import React from 'react'
import App from 'next/app'

const Noop = ({ children }) => children

export default class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props
    const Layout = Component.Layout || Noop

    return (
      <Layout>
        <Component {...pageProps} />
      </Layout>
    )
  }
}
