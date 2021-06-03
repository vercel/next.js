import React from 'react'
import {
  loadGetInitialProps,
  AppContextType,
  AppInitialProps,
  AppPropsType,
  NextWebVitalsMetric,
} from '../next-server/lib/utils'
import { Router } from '../client/router'

export { AppInitialProps }

export { NextWebVitalsMetric }

export type AppContext = AppContextType<Router>

export type AppProps<P = {}> = AppPropsType<Router, P>

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

export default class App<P = {}, CP = {}, S = {}> extends React.Component<
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
