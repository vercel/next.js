import React from 'react'
import App from 'next/app'

const isStatusCodeOk = (res) => {
  try {
    return `${res.statusCode}`.startsWith('2')
  } catch (e) {
    return true
  }
}

class MyApp extends App {
  static async getInitialProps({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return {
      pageProps,
      path: ctx.asPath,
      isOk: isStatusCodeOk(ctx.res),
    }
  }

  render() {
    const { Component, pageProps, isOk } = this.props
    return isOk ? (
      <div>
        <Component {...pageProps[0]} />
      </div>
    ) : (
      /* ⚠️ Important to only render these components when statusCode is NOT ok */
      <Component {...pageProps[0]} />
    )
  }
}

export default MyApp
