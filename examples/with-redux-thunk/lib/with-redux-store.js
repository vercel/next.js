import React from 'react'
import initializeStore from '../store'

const __NEXT_REDUX_STORE__ = '__NEXT_REDUX_STORE__'

function getOrCreateStore(initialState) {
  // Always make a new store if server, otherwise state is shared between requests
  if (typeof window === 'undefined') {
    return initializeStore(initialState)
  }

  // Create store if unavailable on the client and set it on the window object
  if (!window[__NEXT_REDUX_STORE__]) {
    window[__NEXT_REDUX_STORE__] = initializeStore(initialState)
  }
  return window[__NEXT_REDUX_STORE__]
}

export default App => {
  return class AppWithRedux extends React.Component {
    static async getInitialProps(appContext) {
      // Get or Create the store with `undefined` as initialState
      // This allows you to set a custom default initialState
      const store = getOrCreateStore()

      // Provide the store to getInitialProps of pages
      appContext.ctx.store = store

      return {
        ...(App.getInitialProps ? await App.getInitialProps(appContext) : {}),
        initialReduxState: store.getState(),
      }
    }

    render() {
      const { initialReduxState } = this.props
      return <App {...this.props} store={getOrCreateStore(initialReduxState)} />
    }
  }
}
