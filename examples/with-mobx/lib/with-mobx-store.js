import React from 'react'
import {initializeStore} from '../store'

const isServer = typeof window === 'undefined'
const __NEXT_MOBX_STORE__ = '__NEXT_MOBX_STORE__'

function getOrCreateStore(initialState) {
  // Always make a new store if server, otherwise state is shared between requests
  if (isServer) {
    return initializeStore(initialState)
  }

  // Create store if unavailable on the client and set it on the window object
  if (!window[__NEXT_MOBX_STORE__]) {
    window[__NEXT_MOBX_STORE__] = initializeStore(initialState)
  }
  return window[__NEXT_MOBX_STORE__]
}

export default (App) => {
  return class AppWithMobx extends React.Component {
    static async getInitialProps (appContext) {
      // Get or Create the store with `undefined` as initialState
      // This allows you to set a custom default initialState
      const mobxStore = getOrCreateStore()

      // Provide the store to getInitialProps of pages
      appContext.ctx.mobxStore = mobxStore

      let appProps = {}
      if (typeof App.getInitialProps === 'function') {
        appProps = await App.getInitialProps.call(App, appContext)
      }

      return {
        ...appProps,
        initialMobxState: mobxStore
      }
    }

    constructor(props) {
      super(props)
      this.mobxStore = getOrCreateStore(props.initialMobxState)
    }

    render() {
      return <App {...this.props} mobxStore={this.mobxStore} />
    }
  }
}
