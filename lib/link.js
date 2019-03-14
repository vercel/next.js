import React, { Component, Children } from 'react'
import PropTypes from 'prop-types'
import Router from '../client/router'
import { formatPath } from './url'

export default class Link extends Component {
  constructor (props, ...rest) {
    super(props, ...rest)
    this.linkClicked = this.linkClicked.bind(this)
    this.formatUrls(props)
  }

  static propTypes = {
    href: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    as: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    replace: PropTypes.bool,
    shallow: PropTypes.bool,
    passHref: PropTypes.bool,
    scroll: PropTypes.bool,
    children: PropTypes.oneOfType([
      PropTypes.element,
      (props, propName) => {
        const value = props[propName]

        if (typeof value === 'string' && process.env.NODE_ENV !== 'production') {
          console.error(`Warning: You're using a string directly inside <Link>. This usage has been deprecated. Please add an <a> tag as child of <Link>`)
        }

        return null
      }
    ]).isRequired
  }

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
    const { pathname } = window.location
    href = href.replace(/^#/, `${pathname}#`)
    as = as ? as.replace(/^#/, `${pathname}#`) : href

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

  // We accept both 'href' and 'as' as objects which we can pass to `url.format`.
  // We'll handle it here.
  formatUrls (props) {
    this.href = props.href && typeof props.href === 'object'
      ? formatPath(props.href)
      : props.href
    this.as = props.as && typeof props.as === 'object'
      ? formatPath(props.as)
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

    return React.cloneElement(child, props)
  }
}
