import React from 'react'
import { Provider } from 'mobx-react'
import { getSnapshot } from 'mobx-state-tree'
import App from 'next/app'
import { initializeStore } from '../stores/store'

export async function getStaticProps({ Component, ctx }) {
  //
  // Use getStaticProps as a step in the lifecycle when
  // we can initialize our store
  //
  const isServer = typeof window === 'undefined'
  const store = initializeStore(isServer)
  //
  // Check whether the page being rendered by the App has a
  // static getStaticProps method and if so call it
  //
  let pageProps = {}

  if (Component.getStaticProps) {
    pageProps = await Component.getStaticProps(ctx)
  }

  return {
    props: {
      initialState: getSnapshot(store),
      isServer,
      pageProps,
    },
  }
}

export default class MyApp extends App {
  constructor(props) {
    super(props)
    this.store = initializeStore(props.isServer, props.initialState)
  }

  render() {
    const { Component, pageProps } = this.props
    return (
      <Provider store={this.store}>
        <Component {...pageProps} />
      </Provider>
    )
  }
}
