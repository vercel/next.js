import App from 'next/app'
import React from 'react'
import Nav from '../components/Nav'

export default class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props
    return (
      <>
        <Nav />
        <Component {...pageProps} />
      </>
    )
  }
}
