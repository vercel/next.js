import React from 'react'
import PropTypes from 'prop-types'

export default function withRouter(ComposedComponent: React.ComponentType<any> & {getInitialProps?: any}) {
  class WithRouteWrapper extends React.Component {
    static displayName?: string
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
  if (process.env.NODE_ENV !== 'production') {
    const name = ComposedComponent.displayName || ComposedComponent.name || 'Unknown'
    WithRouteWrapper.displayName = `withRouter(${name})`
  }

  return WithRouteWrapper
}
