import React from 'react'

import type {
  AppContextType,
  AppInitialProps,
  AppPropsType,
  NextWebVitalsMetric,
  AppType,
} from '../shared/lib/utils'
import type { Router } from '../client/router'

import { loadGetInitialProps } from '../shared/lib/utils'

export type { AppInitialProps, AppType }

export type { NextWebVitalsMetric }

export type AppContext = AppContextType<Router>

export type AppProps<P = any> = AppPropsType<Router, P>

/**
 * `App` component is used for initialize of pages. It allows for overwriting and full control of the `page` initialization.
 * This allows for keeping state between navigation, custom error handling, injecting additional data.
 */
async function appGetInitialProps({
  Component,
  ctx,
}: AppContext): Promise<AppInitialProps> {
  const pageProps = await loadGetInitialProps(Component, ctx)
  return { pageProps }
}

export default class App<P = any, CP = {}, S = {}> extends React.Component<
  P & AppProps<CP>,
  S
> {
  static origGetInitialProps = appGetInitialProps
  static getInitialProps = appGetInitialProps

  render() {
    const { Component, pageProps } = this.props as AppProps<CP>

    return <Component {...pageProps} />
  }
}
