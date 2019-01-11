import React from 'react'
import hoistStatics from 'hoist-non-react-statics'
import { getDisplayName } from 'next-server/dist/lib/utils'
import { RouterContext } from './router'

export default function withRouter (ComposedComponent) {
  const displayName = getDisplayName(ComposedComponent)

  function WithRouteWrapper (props) {
    return (
      <RouterContext.Consumer>
        {router => (
          <ComposedComponent
            router={router}
            {...props}
          />
        )}
      </RouterContext.Consumer>
    )
  }

  WithRouteWrapper.displayName = `withRouter(${displayName})`

  return hoistStatics(WithRouteWrapper, ComposedComponent)
}
