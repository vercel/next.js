import React from 'react'
import PropTypes from 'prop-types'
import { NextComponentType, IContext } from 'next-server/dist/lib/utils'
import { PublicRouterInstance } from './router';

export type WithRouterProps = {
  router: PublicRouterInstance,
}

export type ExcludeRouterProps<P> = Pick<P, Exclude<keyof P, keyof WithRouterProps>>

export default function withRouter<P extends WithRouterProps, C = IContext>(ComposedComponent: NextComponentType<C, any, P>): React.ComponentClass<ExcludeRouterProps<P>> {
  class WithRouteWrapper extends React.Component<ExcludeRouterProps<P>> {
    static displayName?: string
    static getInitialProps?: any
    static contextTypes = {
      router: PropTypes.object,
    }

    context!: WithRouterProps

    render() {
      return <ComposedComponent
        router={this.context.router}
        {...this.props as any}
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
