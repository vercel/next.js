import React from 'react'
import Link from './link'
import Router from './router'
import { warn } from './utils'

let apiPrinted = false
let linkPrinted = false

export function prefetch (href) {
  if (!apiPrinted) {
    const message = '> You are using deprecated "next/prefetch". It will be removed with Next.js 2.0.\n' +
      '> Use "Router.prefetch(href)" instead.'
    warn(message)

    apiPrinted = true
  }
  return Router.prefetch(href)
}

export default class LinkPrefetch extends React.Component {
  render () {
    if (!linkPrinted) {
      const message = '> You are using deprecated "next/prefetch". It will be removed with Next.js 2.0.\n' +
        '> Use "<Link prefetch />" instead.'
      warn(message)

      linkPrinted = true
    }

    const props = {
      ...this.props,
      prefetch: this.props.prefetch === false ? this.props.prefetch : true
    }

    return (<Link {...props} />)
  }
}
