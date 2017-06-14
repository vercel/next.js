import React, { Component } from 'react'
import PropTypes from 'prop-types'

export default function withRouter (options) {
  return function withRouterComponent (Comp) {
    const compName = Comp.displayName || Comp.name || 'Component'

    return class ComponentWithRouter extends Component {
      static contextTypes = {
        router: PropTypes.object
      }

      static displayName = `withRouter(${compName})`

      render () {
        return <Comp {...this.props} router={this.context.router} />
      }
    }
  }
}
