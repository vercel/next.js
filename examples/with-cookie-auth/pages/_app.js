import React from 'react'
import App from 'next/app'
import Layout from '../components/layout'
import { withAuth } from '../utils/auth'

class MyApp extends App {
  render() {
    const { Component, pageProps, token } = this.props

    return (
      <Layout token={token}>
        <Component {...pageProps} />
      </Layout>
    )
  }
}

export default withAuth(MyApp)
