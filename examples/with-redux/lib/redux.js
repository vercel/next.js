import React from 'react'
import { Provider } from 'react-redux'
import { initializeStore } from '../store'
import App from 'next/app'

export const withRedux = (PageComponent, { ssr = true } = {}) => {
  const WithRedux = ({ initialReduxState, ...props }) => {
    /**
    So when getInitialProps gets called on the server,
    it can ONLY send back serialized JSON.
    Then we immediately render on the client. And so we need to initialize state here,
    with the initial state we got from the server. Cool.
    **/

    const store = getOrInitializeStore(initialReduxState)
    return (
      <Provider store={store}>
        <PageComponent {...props} />
      </Provider>
    )
  }

  // Make sure people don't use this HOC on _app.js level
  if (process.env.NODE_ENV !== 'production') {
    const isAppHoc =
      PageComponent === App || PageComponent.prototype instanceof App
    if (isAppHoc) {
      throw new Error('The withRedux HOC only works with PageComponents')
    }
  }

  // Set the correct displayName in development
  if (process.env.NODE_ENV !== 'production') {
    const displayName =
      PageComponent.displayName || PageComponent.name || 'Component'

    WithRedux.displayName = `withRedux(${displayName})`
  }

  if (ssr || PageComponent.getInitialProps) {
    WithRedux.getInitialProps = async context => {
      // Get or Create the store with `undefined` as initialState
      // This allows you to set a custom default initialState
      const reduxStore = getOrInitializeStore()

      // Provide the store to getInitialProps of pages
      context.reduxStore = reduxStore

      // Run getInitialProps from HOCed PageComponent
      const pageProps =
        typeof PageComponent.getInitialProps === 'function'
          ? await PageComponent.getInitialProps(context)
          : {}

      // Pass props to PageComponent
      return {
        ...pageProps,
        initialReduxState: reduxStore.getState(),
      }
    }
  }

  return WithRedux
}

let reduxStore
const getOrInitializeStore = initialState => {
  // Always make a new store if server, otherwise state is shared between requests
  
  /**
  On the server, we actually NEVER call getOrInitializeStore with initialState...
  Except in the rendering of WithRedux...
  In which case we create ANOTHER store...
  **/
  if (typeof window === 'undefined') {
    return initializeStore(initialState)
  }

  // Create store if unavailable on the client and set it on the window object
  /**
  So the reduxStore will ONLY not exist
  if we are on the client and it's the first page loaded
  **/
  if (!reduxStore) {
    reduxStore = initializeStore(initialState)
  }

  return reduxStore
}
