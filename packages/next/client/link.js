/* global __NEXT_DATA__ */

import { resolve, format, parse } from 'url'
import React, { Component, Children } from 'react'
import PropTypes from 'prop-types'
import Router, {Router as _Router} from 'next/router'
import {execOnce, getLocationOrigin} from 'next-server/dist/lib/utils'

function isLocal (href) {
  const url = parse(href, false, true)
  const origin = parse(getLocationOrigin(), false, true)

  return !url.host ||
    (url.protocol === origin.protocol && url.host === origin.host)
}

function memoizedFormatUrl (formatUrl) {
  let lastHref = null
  let lastAs = null
  let lastResult = null
  return (href, as) => {
    if (href === lastHref && as === lastAs) {
      return lastResult
    }

    const result = formatUrl(href, as)
    lastHref = href
    lastAs = as
    lastResult = result
    return result
  }
}

class Link extends Component {
  componentDidMount () {
    this.prefetch()
  }

  componentDidUpdate (prevProps) {
    if (JSON.stringify(this.props.href) !== JSON.stringify(prevProps.href)) {
      this.prefetch()
    }
  }

  // The function is memoized so that no extra lifecycles are needed
  // as per https://reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html
  formatUrls = memoizedFormatUrl((href, asHref) => {
    return {
      href: href && typeof href === 'object'
        ? format(href)
        : href,
      as: asHref && typeof asHref === 'object'
        ? format(asHref)
        : asHref
    }
  })

  linkClicked = e => {
    const { nodeName, target } = e.currentTarget
    if (nodeName === 'A' &&
      ((target && target !== '_self') || e.metaKey || e.ctrlKey || e.shiftKey || (e.nativeEvent && e.nativeEvent.which === 2))) {
      // ignore click for new tab / new window behavior
      return
    }

    let { href, as } = this.formatUrls(this.props.href, this.props.as)

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

    // replace state instead of push if prop is present
    Router[this.props.replace ? 'replace' : 'push'](href, as, { shallow: this.props.shallow })
      .then((success) => {
        if (!success) return
        if (scroll) {
          window.scrollTo(0, 0)
          document.body.focus()
        }
      })
      .catch((err) => {
        if (this.props.onError) this.props.onError(err)
      })
  };

  prefetch () {
    if (!this.props.prefetch) return
    if (typeof window === 'undefined') return

    // Prefetch the JSON page if asked (only in the client)
    const { pathname } = window.location
    const {href: parsedHref} = this.formatUrls(this.props.href, this.props.as)
    const href = resolve(pathname, parsedHref)
    Router.prefetch(href)
  }

  render () {
    let { children } = this.props
    let { href, as } = this.formatUrls(this.props.href, this.props.as)
    // Deprecated. Warning shown by propType check. If the childen provided is a string (<Link>example</Link>) we wrap it in an <a> tag
    if (typeof children === 'string') {
      children = <a>{children}</a>
    }

    // This will return the first child, if multiple are provided it will throw an error
    const child = Children.only(children)
    const props = {
      onClick: (e) => {
        if (child.props && typeof child.props.onClick === 'function') {
          child.props.onClick(e)
        }
        if (!e.defaultPrevented) {
          this.linkClicked(e)
        }
      }
    }

    // If child is an <a> tag and doesn't have a href attribute, or if the 'passHref' property is
    // defined, we specify the current 'href', so that repetition is not needed by the user
    if (this.props.passHref || (child.type === 'a' && !('href' in child.props))) {
      props.href = as || href
    }

    // Add the ending slash to the paths. So, we can serve the
    // "<page>/index.html" directly.
    if (
      props.href &&
      typeof __NEXT_DATA__ !== 'undefined' &&
      __NEXT_DATA__.nextExport
    ) {
      props.href = _Router._rewriteUrlForNextExport(props.href)
    }

    return React.cloneElement(child, props)
  }
}

if (process.env.NODE_ENV === 'development') {
  const warn = execOnce(console.error)

  // This module gets removed by webpack.IgnorePlugin
  const exact = require('prop-types-exact')
  Link.propTypes = exact({
    href: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    as: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    prefetch: PropTypes.bool,
    replace: PropTypes.bool,
    shallow: PropTypes.bool,
    passHref: PropTypes.bool,
    scroll: PropTypes.bool,
    children: PropTypes.oneOfType([
      PropTypes.element,
      (props, propName) => {
        const value = props[propName]

        if (typeof value === 'string') {
          warn(`Warning: You're using a string directly inside <Link>. This usage has been deprecated. Please add an <a> tag as child of <Link>`)
        }

        return null
      }
    ]).isRequired
  })
}

export default Link
