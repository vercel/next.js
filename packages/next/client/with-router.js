import React, { Component } from 'react'
import PropTypes from 'prop-types'

export default function withRouter (ComposedComponent) {
  class WithRouteWrapper extends Component {
    static contextTypes = {
      router: PropTypes.object
    }

    render () {
      return <ComposedComponent
        router={this.context.router}
        {...this.props}
      />
    }
  }

  WithRouteWrapper.getInitialProps = ComposedComponent.getInitialProps

  return WithRouteWrapper
}
