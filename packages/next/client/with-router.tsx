import React from 'react'
import { NextComponentType, NextPageContext } from '../next-server/lib/utils'
import { NextRouter, RouterContext } from './router'

export type WithRouterProps = {
  router: NextRouter
}

export type ExcludeRouterProps<P> = Pick<
  P,
  Exclude<keyof P, keyof WithRouterProps>
>

export default function withRouter<
  P extends WithRouterProps,
  C = NextPageContext
>(
  ComposedComponent: NextComponentType<C, any, P>
): React.ComponentClass<ExcludeRouterProps<P>> {
  class WithRouteWrapper extends React.Component<ExcludeRouterProps<P>> {
    static displayName?: string
    static getInitialProps?: any
    static contextType = RouterContext

    context!: React.ContextType<typeof RouterContext>

    render() {
      return <ComposedComponent router={this.context} {...this.props as any} />
    }
  }

  WithRouteWrapper.getInitialProps = ComposedComponent.getInitialProps
  // This is needed to allow checking for custom getInitialProps in _app
  ;(WithRouteWrapper as any).origGetInitialProps = (ComposedComponent as any).origGetInitialProps
  if (process.env.NODE_ENV !== 'production') {
    const name =
      ComposedComponent.displayName || ComposedComponent.name || 'Unknown'
    WithRouteWrapper.displayName = `withRouter(${name})`
  }

  return WithRouteWrapper
}
