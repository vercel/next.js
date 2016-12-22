import React, { Component, Children } from 'react'
import Router from './router'

export default class Link extends Component {
  constructor (props) {
    super(props)
    this.linkClicked = this.linkClicked.bind(this)
  }

  linkClicked (e) {
    if (e.target.nodeName === 'A' &&
      (e.metaKey || e.ctrlKey || e.shiftKey || (e.nativeEvent && e.nativeEvent.which === 2))) {
      // ignore click for new tab / new window behavior
      return
    }

    const { href, as } = this.props

    if (!isLocal(href)) {
      // ignore click if it's outside our scope
      return
    }

    e.preventDefault()

    const route = as ? href : null
    const url = as || href

    //  avoid scroll for urls with anchor refs
    let { scroll } = this.props
    if (scroll == null) {
      scroll = url.indexOf('#') < 0
    }

    // straight up redirect
    Router.push(route, url)
      .then((success) => {
        if (!success) return
        if (scroll) window.scrollTo(0, 0)
      })
      .catch((err) => {
        if (this.props.onError) this.props.onError(err)
      })
  }

  render () {
    const children = Children.map(this.props.children, (child) => {
      const props = {
        onClick: this.linkClicked
      }

      const isAnchor = child && child.type === 'a'

      // if child does not specify a href, specify it
      // so that repetition is not needed by the user
      if (!isAnchor || !('href' in child.props)) {
        props.href = this.props.as || this.props.href
      }

      if (isAnchor) {
        return React.cloneElement(child, props)
      } else {
        return <a {...props}>{child}</a>
      }
    })

    return children[0]
  }
}

export function isLocal (href) {
  const origin = window.location.origin
  return !/^https?:\/\//.test(href) ||
    origin === href.substr(0, origin.length)
}
