import React from 'react'
import {
  loadGetInitialProps,
  AppContextType,
  AppInitialProps,
  AppType,
  AppPropsType,
  NextWebVitalsMetric,
} from '../shared/lib/utils'
import type { NextRouter } from '../client/router'

export { AppInitialProps }

export { AppType }

export { NextWebVitalsMetric }

export type AppContext<IP = {}, P = {}> = AppContextType<NextRouter, IP, P>

export type AppProps<P = {}> = AppPropsType<NextRouter, P>

/**
 * `App` component is used for initialize of pages. It allows for overwriting and full control of the `page` initialization.
 * This allows for keeping state between navigation, custom error handling, injecting additional data.
 */
async function appGetInitialProps<IP = {}, P = {}>({
  Component,
  ctx,
}: AppContext<IP, P>): Promise<AppInitialProps<IP>> {
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
