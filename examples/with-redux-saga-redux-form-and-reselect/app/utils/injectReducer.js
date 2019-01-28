import React from 'react'
import PropTypes from 'prop-types'
import hoistNonReactStatics from 'hoist-non-react-statics'

import getInjectors from './reducerInjectors'

export default ({ key, reducer }) => WrappedComponent => {
  class ReducerInjector extends React.Component {
    static WrappedComponent = WrappedComponent;
    static contextTypes = { store: PropTypes.object.isRequired };
    static displayName = `withReducer(${WrappedComponent.displayName ||
      WrappedComponent.name ||
      'Component'})`;
    // eslint-disable-next-line
    UNSAFE_componentWillMount() {
      const { injectReducer } = this.injectors

      injectReducer(key, reducer)
    }

    injectors = getInjectors(this.context.store);

    render () {
      return <WrappedComponent {...this.props} />
    }
  }

  return hoistNonReactStatics(ReducerInjector, WrappedComponent)
}
