import React, { Component } from 'react'
import router from './router'
import hoistStatics from 'hoist-non-react-statics'
import { getDisplayName } from 'next-server/dist/lib/utils'

export default function withRouter (ComposedComponent) {
  const displayName = getDisplayName(ComposedComponent)

  class WithRouteWrapper extends Component {
    static displayName = `withRouter(${displayName})`

    render () {
      return <ComposedComponent
        router={router}
        {...this.props}
      />
    }
  }

  return hoistStatics(WithRouteWrapper, ComposedComponent)
}
