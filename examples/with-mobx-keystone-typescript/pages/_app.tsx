import { getSnapshot, SnapshotOutOf } from 'mobx-keystone'
import App from 'next/app'
import React from 'react'
import { RootStore, StoreProvider, initStore } from '../store'

interface IOwnProps {
  isServer: boolean
  initialState: SnapshotOutOf<RootStore>
}

class MyApp extends App<IOwnProps> {
  public static async getInitialProps({ Component, router, ctx }) {
    //
    // Use getInitialProps as a step in the lifecycle when
    // we can initialize our store
    //
    const isServer = typeof window === 'undefined'
    const store = initStore()

    //
    // Check whether the page being rendered by the App has a
    // static getInitialProps method and if so call it
    //
    let pageProps = {}
    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }
    return {
      initialState: getSnapshot(store),
      isServer,
      pageProps,
    }
  }

  public render() {
    const { Component, pageProps, initialState } = this.props

    return (
      <StoreProvider snapshot={initialState}>
        <Component {...pageProps} />
      </StoreProvider>
    )
  }
}

export default MyApp
