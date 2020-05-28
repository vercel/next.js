import { Provider } from 'react-redux'
import { initializeStore } from '../store'
import App from 'next/app'

export const withRedux = (PageComponent) => {
  const WithRedux = ({ initialReduxState, ...props }) => {
    const store = initializeClientSideStore(initialReduxState)
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
  return WithRedux
}

let reduxStore

export const initializeServerSideStore = (initialState) => {
  // Always make a new store if server ('getStaticProps' or 'getServerSideProps'), to avoid sharing the state between requests.
  // Check ssg.js and ssr.js pages for usage
  return initializeStore(initialState)
}

export const initializeClientSideStore = (initialState) => {
  // Create store if unavailable on the client and set it on the window object
  if (!reduxStore) {
    reduxStore = initializeStore(initialState)
  }
  return reduxStore
}
