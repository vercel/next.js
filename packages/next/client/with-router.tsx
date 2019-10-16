import React from 'react'
import { NextComponentType, NextPageContext } from '../next-server/lib/utils'
import { NextRouter, useRouter } from './router'

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
): React.ComponentType<ExcludeRouterProps<P>> {
  function WithRouteWrapper(props: any) {
    return <ComposedComponent router={useRouter()} {...props} />
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
