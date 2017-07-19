/* global __NEXT_DATA__ */

import { resolve, format, parse } from 'url'
import React, { Component, Children } from 'react'
import PropTypes from 'prop-types'
import exact from 'prop-types-exact'
import Router, { _rewriteUrlForNextExport } from './router'
import { warn, execOnce, getLocationOrigin } from './utils'

export default class Link extends Component {
  constructor (props, ...rest) {
    super(props, ...rest)
    this.linkClicked = this.linkClicked.bind(this)
    this.formatUrls(props)
  }

  static propTypes = exact({
    href: PropTypes.string,
    as: PropTypes.string,
    prefetch: PropTypes.bool,
    children: PropTypes.oneOfType([
      PropTypes.element,
      (props, propName) => {
        const value = props[propName]

        if (typeof value === 'string') {
          warnLink(`Warning: You're using a string directly inside <Link>. This usage has been deprecated. Please add an <a> tag as child of <Link>`)
        }

        return null
      }
    ]).isRequired,
    shallow: PropTypes.bool,
    passHref: PropTypes.bool
  })

  componentWillReceiveProps (nextProps) {
    this.formatUrls(nextProps)
  }

  linkClicked (e) {
    if (e.currentTarget.nodeName === 'A' &&
      (e.metaKey || e.ctrlKey || e.shiftKey || (e.nativeEvent && e.nativeEvent.which === 2))) {
      // ignore click for new tab / new window behavior
      return
    }

    const { shallow } = this.props
    let { href, as } = this

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
    const { replace } = this.props
    const changeMethod = replace ? 'replace' : 'push'

    // straight up redirect
    Router[changeMethod](href, as, { shallow })
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
    const href = resolve(pathname, this.href)
    Router.prefetch(href)
  }

  componentDidMount () {
    this.prefetch()
  }

  componentDidUpdate (prevProps) {
    if (JSON.stringify(this.props.href) !== JSON.stringify(prevProps.href)) {
      this.prefetch()
    }
  }

  // We accept both 'href' and 'as' as objects which we can pass to `url.format`.
  // We'll handle it here.
  formatUrls (props) {
    this.href = props.href && typeof props.href === 'object'
      ? format(props.href)
      : props.href
    this.as = props.as && typeof props.as === 'object'
      ? format(props.as)
      : props.as
  }

  render () {
    let { children } = this.props
    let { href, as } = this
    // Deprecated. Warning shown by propType check. If the childen provided is a string (<Link>example</Link>) we wrap it in an <a> tag
    if (typeof children === 'string') {
      children = <a>{children}</a>
    }

    // This will return the first child, if multiple are provided it will throw an error
    const child = Children.only(children)
    const props = {
      onClick: this.linkClicked
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
      props.href = _rewriteUrlForNextExport(props.href)
    }

    return React.cloneElement(child, props)
  }
}

function isLocal (href) {
  const url = parse(href, false, true)
  const origin = parse(getLocationOrigin(), false, true)
  return !url.host ||
    (url.protocol === origin.protocol && url.host === origin.host)
}

const warnLink = execOnce(warn)
