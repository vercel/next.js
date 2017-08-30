import React, { Component } from 'react'
import PropTypes from 'prop-types'
import hoistStatics from 'hoist-non-react-statics'
import { getDisplayName } from '../utils'

export default function withRoute (ComposedComponent) {
  const displayName = getDisplayName(ComposedComponent)

  class WithRouteWrapper extends Component {
    static contextTypes = {
      router: PropTypes.object
    }

    static displayName = `withRoute(${displayName})`

    render () {
      const props = {
        router: this.context.router,
        ...this.props
      }

      return <ComposedComponent {...props} />
    }
  }

  return hoistStatics(WithRouteWrapper, ComposedComponent)
}
