/* global __NEXT_DATA__ */
declare const __NEXT_DATA__: any

import { resolve, parse, UrlObject } from 'url'
import React, { Component, Children } from 'react'
import PropTypes from 'prop-types'
import Router from './router'
import { rewriteUrlForNextExport } from 'next-server/dist/lib/router/rewrite-url-for-export'
import { execOnce, formatWithValidation, getLocationOrigin } from 'next-server/dist/lib/utils'

function isLocal(href: string) {
  const url = parse(href, false, true)
  const origin = parse(getLocationOrigin(), false, true)

  return !url.host ||
    (url.protocol === origin.protocol && url.host === origin.host)
}

type Url = string|UrlObject
type FormatResult = {href: string, as?: string}

function memoizedFormatUrl(formatFunc: (href: Url, as?: Url) => FormatResult) {
  let lastHref: null|Url = null
  let lastAs: undefined|null|Url = null
  let lastResult: null|FormatResult = null
  return (href: Url, as?: Url) => {
    if (lastResult && href === lastHref && as === lastAs) {
      return lastResult
    }

    const result = formatFunc(href, as)
    lastHref = href
    lastAs = as
    lastResult = result
    return result
  }
}

function formatUrl(url: Url) {
  return url && typeof url === 'object'
    ? formatWithValidation(url)
    : url
}

type LinkProps = {
  href: Url,
  as?: Url|undefined,
  replace?: boolean,
  scroll?: boolean,
  shallow?: boolean,
  passHref?: boolean
  onError?: (error: Error) => void,
}

let observer: IntersectionObserver
const listeners = new Map()
const IntersectionObserver = typeof window !== 'undefined'
  ? (window as any).IntersectionObserver : null

function getObserver() {
  // Return shared instance of IntersectionObserver if already created
  if (observer) {
    return observer
  }

  // Only create shared IntersectionObserver if supported in browser
  if (!IntersectionObserver) {
    return undefined
  }

  return (observer = new IntersectionObserver(
      (entries: any) => {
        entries.forEach((entry: any) => {
        if (!listeners.has(entry.target)) {
          return
        }

        const cb = listeners.get(entry.target)
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
              observer.unobserve(entry.target)
              listeners.delete(entry.target)
              cb()
            }
        })
      },
      { rootMargin: '200px' },
  ))
}

const listenToIntersections = (el: any, cb: any) => {
  const observer = getObserver()
  if (!observer) {
    return () => {}
  }

  observer.observe(el)
  listeners.set(el, cb)
  return () => {
    observer.unobserve(el)
    listeners.delete(el)
  }
}

class Link extends Component<LinkProps> {
  static propTypes?: any
  cleanUpListeners = () => {}

  componentDidMount() {
    this.cleanUpListeners = () => {}
  }

  componentWillUnmount() {
    this.cleanUpListeners()
  }

  handleRef(ref: Element) {
    if (IntersectionObserver && ref && ref.tagName) {
      this.cleanUpListeners = listenToIntersections(ref, () => {
        this.prefetch()
      })
    }
  }

  // The function is memoized so that no extra lifecycles are needed
  // as per https://reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html
  formatUrls = memoizedFormatUrl((href, asHref) => {
    return {
      href: formatUrl(href),
      as: asHref ? formatUrl(asHref) : asHref,
    }
  })

  linkClicked = (e: React.MouseEvent) => {
    // @ts-ignore target exists on currentTarget
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
      .then((success: boolean) => {
        if (!success) return
        if (scroll) {
          window.scrollTo(0, 0)
          document.body.focus()
        }
      })
      .catch((err: any) => {
        if (this.props.onError) this.props.onError(err)
      })
  };

  prefetch() {
    if (typeof window === 'undefined') return

    // Prefetch the JSON page if asked (only in the client)
    const { pathname } = window.location
    const { href: parsedHref } = this.formatUrls(this.props.href, this.props.as)
    const href = resolve(pathname, parsedHref)
    Router.prefetch(href)
  }

  render() {
    let { children } = this.props
    const { href, as } = this.formatUrls(this.props.href, this.props.as)
    // Deprecated. Warning shown by propType check. If the childen provided is a string (<Link>example</Link>) we wrap it in an <a> tag
    if (typeof children === 'string') {
      children = <a>{children}</a>
    }

    // This will return the first child, if multiple are provided it will throw an error
    const child: any = Children.only(children)
    const props: {
      onMouseEnter: React.MouseEventHandler,
      onClick: React.MouseEventHandler,
      href?: string,
      ref?: any,
    } = {
      ref: (el: any) => this.handleRef(el),
      onMouseEnter: () => {
        this.prefetch()
      },
      onClick: (e: React.MouseEvent) => {
        if (child.props && typeof child.props.onClick === 'function') {
          child.props.onClick(e)
        }
        if (!e.defaultPrevented) {
          this.linkClicked(e)
        }
      },
    }

    // If child is an <a> tag and doesn't have a href attribute, or if the 'passHref' property is
    // defined, we specify the current 'href', so that repetition is not needed by the user
    if (this.props.passHref || (child.type === 'a' && !('href' in child.props))) {
      props.href = as || href
    }

    // Add the ending slash to the paths. So, we can serve the
    // "<page>/index.html" directly.
    if (process.env.__NEXT_EXPORT_TRAILING_SLASH) {
      if (
        props.href &&
        typeof __NEXT_DATA__ !== 'undefined' &&
        __NEXT_DATA__.nextExport
      ) {
        props.href = rewriteUrlForNextExport(props.href)
      }
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
      (props: any, propName) => {
        const value = props[propName]

        if (typeof value === 'string') {
          warn(`Warning: You're using a string directly inside <Link>. This usage has been deprecated. Please add an <a> tag as child of <Link>`)
        }

        return null
      },
    ]).isRequired,
  })
}

export default Link
