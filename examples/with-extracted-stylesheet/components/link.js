import React from 'react'
import { orderedRoutes } from '../routes'
import { default as NextLink } from 'next/link'
import { format } from 'url'

const routes = orderedRoutes()

function propsForHref (href) {
  if (href[href.length - 1]) href += '/'

  for (const route of routes) {
    if (href.indexOf(route.pathname) === 0) {
      return {
        as: route.pathname,
        href: format({ ...route, pathname: route.page })
      }
    }
  }

  throw new Error('Unknown route: ' + href)
}

export default props => <NextLink {...props} {...propsForHref(props.href)} />
