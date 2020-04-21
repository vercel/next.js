import React from 'react'
import App from 'next/app'

const isStatusCodeOk = res => {
  try {
    return `${res.statusCode}`.startsWith('2')
  } catch (e) {
    return true
  }
}

class MyApp extends App {
  constructor(props) {
    super(props)
    this.setCmpToken()
  }

  setCmpToken() {
    if (process.browser) {
      const urlParams = new URLSearchParams(window.location.search)
      const maybeCmpQueryParameter = urlParams.get('cmp')

      if (maybeCmpQueryParameter) {
        window.localStorage.setItem('cmptoken', maybeCmpQueryParameter)
      }
    }
  }

  static async getInitialProps({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    console.log("pageProps", pageProps);
    return {
      pageProps,
      path: ctx.asPath,
      isOk: isStatusCodeOk(ctx.res),
    }
  }

  render() {
    const { Component, pageProps, path, route, isOk } = this.props
    
    console.log("pageProps render", pageProps[0]);
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
