import App from 'next/app'
import React from 'react'
import withIdentity from '../lib/withIdentity'

class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props
    return <Component {...pageProps} />
  }
}

export default withIdentity(MyApp)
