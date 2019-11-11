import React, { Suspense } from 'react'
import App from 'next/app'

class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props
    if (typeof window === 'undefined') {
      return <Component {...pageProps} />
    }

    return (
      <Suspense fallback={<div>Loading...</div>}>
        <Component {...pageProps} />
      </Suspense>
    )
  }
}

export default MyApp
