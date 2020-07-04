import React from 'react'
import App, { AppInitialProps, AppContext } from 'next/app'
import { END } from 'redux-saga'
import { wrapper, SagaStore } from '../store'

import 'components/layouts/layout.css'

class WrappedApp extends App<AppInitialProps> {
  public static getInitialProps = async ({ Component, ctx }: AppContext) => {
    // 1. Wait for all page actions to dispatch
    const pageProps = {
      ...(Component.getInitialProps
        ? await Component.getInitialProps(ctx)
        : {}),
    }

    // 2. Stop the saga if on server
    if (ctx.req) {
      ctx.store.dispatch(END)
      await (ctx.store as SagaStore).sagaTask?.toPromise()
    }

    // 3. Return props
    return {
      pageProps,
    }
  }

  public render() {
    const { Component, pageProps } = this.props
    return <Component {...pageProps} />
  }
}

export default wrapper.withRedux(WrappedApp)
