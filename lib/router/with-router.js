import React, { Component } from 'react'
import PropTypes from 'prop-types'
import hoistStatics from 'hoist-non-react-statics'

export default function withRouter (options = {}) {
  const { routerPropName = 'router' } = options

  return function withRouterComponent (ComposedComponent) {
    class WithRouterWrapper extends Component {
      static contextTypes = {
        router: PropTypes.object
      }

      static displayName = `withRouter(${ComposedComponent.displayName})`

      render () {
        const props = {
          [routerPropName]: this.context.router,
          ...this.props
        }

        return (
          <ComposedComponent {
            ...props
          } />
        )
      }
    }

    return hoistStatics(WithRouterWrapper, ComposedComponent)
  }
}
