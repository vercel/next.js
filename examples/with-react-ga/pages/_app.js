import React from 'react'
import App from 'next/app'
import Router from 'next/router'
import { initGA, logPageView } from '../utils/analytics'

export default class MyApp extends App {
  componentDidMount() {
    initGA()
    logPageView()
    Router.events.on('routeChangeComplete', logPageView)
  }

  render() {
    const { Component, pageProps } = this.props
    return <Component {...pageProps} />
  }
}
