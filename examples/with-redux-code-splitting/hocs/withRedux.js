import React from 'react'
import { connect, Provider } from 'react-redux'
import { createStore as reduxCreateStore, combineReducers } from 'redux'

/**
 * Patch redux `createStore`
 * function in order to
 *
 * - track `globalReducers`
 * - merge `localReducers`
 * - extend the store with the `injectLocalReducers`
 *   utility function
 *
 * @param  {Object} globalReducers
 * @param  {Object} [initialState]
 * @param  {Function} [enhancer]
 * @param  {Object} localReducers
 * @return {Object}
 */
export const createStore = (globalReducers, initialState = {}, enhancer, localReducers = {}) => {
  const reducer = combineReducers({
    ...globalReducers,
    ...localReducers
  })

  const store = reduxCreateStore(
    reducer,
    initialState,
    enhancer
  )

  store.injectLocalReducers = function (localReducers) {
    const newReducer = combineReducers({
      ...globalReducers,
      ...localReducers
    })
    store.replaceReducer(newReducer)
  }

  return store
}

/**
 * Create store or extend it
 *
 * @param  {Function} createStore
 * @param  {Object}   [initialState]
 * @param  {Object}   [localReducers]
 * @return {Object}
 */
let clientStore = null
const createOrExtendStore = (createStore, req, initialState, localReducers) => {
  const isServer = !!req

    // Create Server Store
  if (isServer) {
      // In order to connect to the store from the `_document`
      // component we need to add it to the current request object.
    if (!req.reduxStore) {
      req.reduxStore = createStore(initialState, localReducers)
    }
    return req.reduxStore
  }

    // Create Client Store
  if (!clientStore) {
    clientStore = createStore(initialState, localReducers)
  }

  clientStore.injectLocalReducers(localReducers)

  return clientStore
}

export default (createStore, ...connectArgs) => ComposedComponent => {
  // Since provide should always be after connect we connect here
  const ConnectedCmp = connect(...connectArgs)(ComposedComponent)

  // Get the localReducers from the ComposedComponent component
  const localReducers = ComposedComponent.getLocalReducers
    ? ComposedComponent.getLocalReducers()
    : {}

  // Create the actual higher order component
  return class extends React.Component {
    static async getInitialProps (context) {
      // Add the redux store to the context object
      context.store = createOrExtendStore(createStore, context.req, {}, localReducers)

      // Get the `initialProps` from the ComposedComponent
      const initialProps = ComposedComponent.getInitialProps
          ? await ComposedComponent.getInitialProps(context)
          : {}

      return {
        store: context.store,
        initialState: context.store.getState(),
        initialProps
      }
    }

    constructor (props) {
      super(props)

      // After ssr we need to create the
      // store on the client, too.
      this.store = props.store && props.store.getState
          ? props.store
          : createOrExtendStore(createStore, undefined, props.initialState, localReducers)
    }

    render () {
      return (
        <Provider store={this.store}>
          <ConnectedCmp {...this.props.initialProps} />
        </Provider>
      )
    }
  }
}
