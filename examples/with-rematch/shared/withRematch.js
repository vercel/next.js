import React from 'react'
import { connect, Provider } from 'react-redux'

export default (store, ...connectArgs) => Component => {
  const ConnectedComponent = connect.apply(null, connectArgs)(Component)

  const ComponentWithRematch = () => {
    return (
      <Provider store={store}>
        <ConnectedComponent />
      </Provider>
    )
  }

  ComponentWithRematch.getInitialProps = async (context = {}) => {
    if (Component.getInitialProps) {
      // Just invokes getInitialProps. Props are passed exclusively through redux.
      await Component.getInitialProps()
    }
    return {}
  }

  return ComponentWithRematch
}
