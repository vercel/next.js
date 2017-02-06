import React from 'react'
import Link from './link'
import Router from './router'

export function prefetch (href) {
  return Router.prefetch(href)
}

export default class LinkPrefetch extends React.Component {
  render () {
    const props = {
      ...this.props,
      prefetch: this.props.prefetch === false ? this.props.prefetch : true
    }

    return (<Link {...props} />)
  }
}
