import React from 'react'
import App from 'next/app'

export default class MyApp extends App {
  // find this

  static async getInitialProps({ ctx }) {
    const { query, pathname, asPath } = ctx
    return { url: { query, pathname, asPath } }
  }

  render() {
    const { Component, url } = this.props
    return <Component url={url} />
  }
}
