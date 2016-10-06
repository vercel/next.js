import React, { Component, PropTypes, Children } from 'react'

export default class Link extends Component {
  static contextTypes = {
    router: PropTypes.object
  }

  constructor (props) {
    super(props)
    this.linkClicked = this.linkClicked.bind(this)
  }

  linkClicked (e) {
    if ('A' === e.target.nodeName &&
      (e.metaKey || e.ctrlKey || e.shiftKey || 2 === e.nativeEvent.which)) {
      // ignore click for new tab / new window behavior
      return
    }

    const { href, scroll } = this.props

    if (!isLocal(href)) {
      // ignore click if it's outside our scope
      return
    }

    e.preventDefault()

    // straight up redirect
    this.context.router.goTo(href, (err) => {
      if (err) {
        if (this.props.onError) this.props.onError(err)
        return
      }

      if (false !== scroll) {
        window.scrollTo(0, 0)
      }
    })
  }

  render () {
    const children = Children.map(this.props.children, (child) => {
      const props = {
        onClick: this.linkClicked
      }

      const isChildAnchor = child && 'a' === child.type

      // if child does not specify a href, specify it
      // so that repetition is not needed by the user
      if (!isChildAnchor || !('href' in child.props)) {
        props.href = this.props.href
      }

      if (isChildAnchor) {
        return React.cloneElement(child, props)
      } else {
        return <a {...props}>{child}</a>
      }
    })

    return children[0]
  }
}

function isLocal (href) {
  const origin = location.origin
  return !/^https?:\/\//.test(href) ||
    origin === href.substr(0, origin.length)
}
