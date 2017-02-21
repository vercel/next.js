import { resolve } from 'url'
import React, { Component, Children, PropTypes } from 'react'
import Router from './router'
import { warn, execOnce, getLocationOrigin } from './utils'

export default class Link extends Component {
  constructor (props) {
    super(props)
    this.linkClicked = this.linkClicked.bind(this)
  }

  static propTypes = {
    children: PropTypes.oneOfType([
      PropTypes.element,
      (props, propName) => {
        const value = props[propName]

        if (typeof value === 'string') {
          warnLink(`Warning: You're using a string directly inside <Link>. This usage has been deprecated. Please add an <a> tag as child of <Link>`)
        }

        return null
      }
    ]).isRequired
  }

  linkClicked (e) {
    if (e.currentTarget.nodeName === 'A' &&
      (e.metaKey || e.ctrlKey || e.shiftKey || (e.nativeEvent && e.nativeEvent.which === 2))) {
      // ignore click for new tab / new window behavior
      return
    }

    let { href, as } = this.props

    if (!isLocal(href)) {
      // ignore click if it's outside our scope
      return
    }

    const { pathname } = window.location
    href = resolve(pathname, href)
    as = as ? resolve(pathname, as) : href

    e.preventDefault()

    //  avoid scroll for urls with anchor refs
    let { scroll } = this.props
    if (scroll == null) {
      scroll = as.indexOf('#') < 0
    }

    // straight up redirect
    Router.push(href, as)
      .then((success) => {
        if (!success) return
        if (scroll) window.scrollTo(0, 0)
      })
      .catch((err) => {
        if (this.props.onError) this.props.onError(err)
      })
  }

  prefetch () {
    if (!this.props.prefetch) return
    if (typeof window === 'undefined') return

    // Prefetch the JSON page if asked (only in the client)
    const { pathname } = window.location
    const href = resolve(pathname, this.props.href)
    Router.prefetch(href)
  }

  componentDidMount () {
    this.prefetch()
  }

  componentDidUpdate (prevProps) {
    if (this.props.href !== prevProps.href) {
      this.prefetch()
    }
  }

  render () {
    let { children } = this.props
    // Deprecated. Warning shown by propType check. If the childen provided is a string (<Link>example</Link>) we wrap it in an <a> tag
    if (typeof children === 'string') {
      children = <a>{children}</a>
    }

    // This will return the first child, if multiple are provided it will throw an error
    const child = Children.only(children)
    const props = {
      onClick: this.linkClicked
    }

    // If child is an <a> tag and doesn't have a href attribute we specify it so that repetition is not needed by the user
    if (child.type === 'a' && !('href' in child.props)) {
      props.href = this.props.as || this.props.href
    }

    return React.cloneElement(child, props)
  }
}

function isLocal (href) {
  const origin = getLocationOrigin()
  return !/^(https?:)?\/\//.test(href) ||
    origin === href.substr(0, origin.length)
}

const warnLink = execOnce(warn)
