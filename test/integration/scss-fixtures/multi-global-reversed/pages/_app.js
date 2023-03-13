import React from 'react'
import App from 'next/app'
import '../styles/global2.scss'
import '../styles/global1.scss'

class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props
    return <Component {...pageProps} />
  }
}

export default MyApp
