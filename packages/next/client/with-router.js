import React, { Component } from 'react'
import hoistStatics from 'hoist-non-react-statics'
import { getDisplayName } from 'next-server/dist/lib/utils'
import { RouterContext } from 'next/router'

export default function withRouter (ComposedComponent) {
  const displayName = getDisplayName(ComposedComponent)

  class WithRouteWrapper extends Component {
    static displayName = `withRouter(${displayName})`

    static contextType = RouterContext

    render () {
      return <ComposedComponent
        router={this.context}
        {...this.props}
      />
    }
  }

  return hoistStatics(WithRouteWrapper, ComposedComponent)
}
