import { Provider} from 'refnux'

import getStore from './getStore'

// The `withRefnux` "decorator"
// - wraps the given Component in a refnux Provider component
// - creates a `store` for the Provider handling different server side / client side cases
// - runs wrapped component `getInitialProps` as expected
// - passes `store` to Component's `getInitialProps` so that it can dispatch actions

const withRefnux = (getInitialState, Component) => {

  const Wrapper = (props) => {
    var store = props.store
    // if getInitialProps was executed on the server we get a store
    // that's missing non-serializable functions.
    // Because of this we need to recreate the store based on the 
    // state coming from the server.
    if (!store.dispatch) {
      store = getStore(props.store.state)
    }
    return <Provider
      store={store}
      app={() => <Component {...props.componentProps} />}
    />
  }

  Wrapper.getInitialProps = async function (context) {
    const store = getStore(getInitialState())
    var componentProps = {}
    // honor wrapped component getInitialProps
    if (Component.getInitialProps) {
      componentProps = await Component.getInitialProps({ ...context, store })
    }
    return { store, componentProps }
  }

  return Wrapper
}


export default withRefnux