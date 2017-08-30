import React, { Component } from 'react'
import PropTypes from 'prop-types'
import hoistStatics from 'hoist-non-react-statics'
import { getDisplayName } from '../utils'

export const propTypeRoute = PropTypes.shape({
  asPath: PropTypes.string,
  pathname: PropTypes.string,
  query: PropTypes.object
})

export default function withRoute (ComposedComponent) {
  const displayName = getDisplayName(ComposedComponent)

  class WithRouteWrapper extends Component {
    static contextTypes = {
      route: propTypeRoute
    }

    static displayName = `withRoute(${displayName})`

    render () {
      const props = {
        route: this.context.route,
        ...this.props
      }

      return <ComposedComponent {...props} />
    }
  }

  return hoistStatics(WithRouteWrapper, ComposedComponent)
}

const publicRouteProps = ['asPath', 'pathname', 'query']

export const reduceRouterToRoute = (router) => {
  return publicRouteProps.reduce((route, propName) => {
    route[propName] = router[propName]
    return route
  }, {})
}
