import React from 'react'
import PropTypes from 'prop-types'

export default function withRouter(ComposedComponent: React.ComponentType<any> & {getInitialProps?: any}) {
  class WithRouteWrapper extends React.Component {
    static getInitialProps?: any
    static contextTypes = {
      router: PropTypes.object,
    }

    render() {
      return <ComposedComponent
        router={this.context.router}
        {...this.props}
      />
    }
  }

  WithRouteWrapper.getInitialProps = ComposedComponent.getInitialProps

  return WithRouteWrapper
}
