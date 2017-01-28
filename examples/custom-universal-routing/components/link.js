import React from 'react'
import NextLink from 'next/link'
import {customRoutes} from '../next.config'

function matchInternal (route) {
  const match = customRoutes.find((element) => {
    return route.match(element.test)
  })

  return match ? match.routeTo : false
}

export default class Link extends React.Component {
  render () {
    const internalRoute = matchInternal(this.props.href)

    return <NextLink href={internalRoute} as={this.props.href}>
      {this.props.children}
    </NextLink>
  }
}
