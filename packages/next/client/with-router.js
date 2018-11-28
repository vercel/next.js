import React, { Component } from 'react'
import PropTypes from 'prop-types'
import hoistStatics from 'hoist-non-react-statics'
import { getDisplayName } from 'next-server/dist/lib/utils'

export default function withRouter (ComposedComponent) {
  const displayName = getDisplayName(ComposedComponent)

  class WithRouteWrapper extends Component {
    static contextTypes = {
      router: PropTypes.object
    }

    static displayName = `withRouter(${displayName})`

    render () {
      return <ComposedComponent
        router={this.context.router}
        {...this.props}
      />
    }
  }

  return hoistStatics(WithRouteWrapper, ComposedComponent)
}
