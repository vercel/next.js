declare const __NEXT_DATA__: any

import React, { Children } from 'react'
import { UrlObject } from 'url'
import { PrefetchOptions, NextRouter } from '../next-server/lib/router/router'
import { execOnce, getLocationOrigin } from '../next-server/lib/utils'
import { useRouter } from './router'
import { addBasePath, resolveHref } from '../next-server/lib/router/router'

/**
 * Detects whether a given url is from the same origin as the current page (browser only).
 */
function isLocal(url: string): boolean {
  const locationOrigin = getLocationOrigin()
  const resolved = new URL(url, locationOrigin)
  return resolved.origin === locationOrigin
}

type Url = string | UrlObject

export type LinkProps = {
  href: Url
  as?: Url
  replace?: boolean
  scroll?: boolean
  shallow?: boolean
  passHref?: boolean
  prefetch?: boolean
}

let cachedObserver: IntersectionObserver
const listeners = new Map<Element, () => void>()
const IntersectionObserver =
  typeof window !== 'undefined' ? window.IntersectionObserver : null
const prefetched: { [cacheKey: string]: boolean } = {}

function getObserver(): IntersectionObserver | undefined {
  // Return shared instance of IntersectionObserver if already created
  if (cachedObserver) {
    return cachedObserver
  }

  // Only create shared IntersectionObserver if supported in browser
  if (!IntersectionObserver) {
    return undefined
  }

  return (cachedObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!listeners.has(entry.target)) {
          return
        }

        const cb = listeners.get(entry.target)!
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          cachedObserver.unobserve(entry.target)
          listeners.delete(entry.target)
          cb()
        }
      })
    },
    { rootMargin: '200px' }
  ))
}

const listenToIntersections = (el: Element, cb: () => void) => {
  const observer = getObserver()
  if (!observer) {
    return () => {}
  }

  observer.observe(el)
  listeners.set(el, cb)
  return () => {
    try {
      observer.unobserve(el)
    } catch (err) {
      console.error(err)
    }
    listeners.delete(el)
  }
}

function prefetch(
  router: NextRouter,
  href: string,
  as: string,
  options?: PrefetchOptions
): void {
  if (typeof window === 'undefined') return
  // Prefetch the JSON page if asked (only in the client)
  // We need to handle a prefetch error here since we may be
  // loading with priority which can reject but we don't
  // want to force navigation since this is only a prefetch
  router.prefetch(href, as, options).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      // rethrow to show invalid URL errors
      throw err
    }
  })
  // Join on an invalid URI character
  prefetched[href + '%' + as] = true
}

function linkClicked(
  e: React.MouseEvent,
  router: NextRouter,
  href: string,
  as: string,
  replace?: boolean,
  shallow?: boolean,
  scroll?: boolean
): void {
  const { nodeName, target } = e.currentTarget as HTMLAnchorElement
  if (
    nodeName === 'A' &&
    ((target && target !== '_self') ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      (e.nativeEvent && e.nativeEvent.which === 2))
  ) {
    // ignore click for new tab / new window behavior
    return
  }

  if (!isLocal(href)) {
    // ignore click if it's outside our scope (e.g. https://google.com)
    return
  }

  e.preventDefault()

  //  avoid scroll for urls with anchor refs
  if (scroll == null) {
    scroll = as.indexOf('#') < 0
  }

  // replace state instead of push if prop is present
  router[replace ? 'replace' : 'push'](href, as, { shallow }).then(
    (success: boolean) => {
      if (!success) return
      if (scroll) {
        window.scrollTo(0, 0)
        document.body.focus()
      }
    }
  )
}

function Link(props: React.PropsWithChildren<LinkProps>) {
  if (process.env.NODE_ENV !== 'production') {
    // This hook is in a conditional but that is ok because `process.env.NODE_ENV` never changes
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const hasWarned = React.useRef(false)
    if (props.prefetch && !hasWarned.current) {
      hasWarned.current = true
      console.warn(
        'Next.js auto-prefetches automatically based on viewport. The prefetch attribute is no longer needed. More: https://err.sh/vercel/next.js/prefetch-true-deprecated'
      )
    }
  }
  const p = props.prefetch !== false

  const [childElm, setChildElm] = React.useState<Element>()

  const router = useRouter()
  const pathname = (router && router.pathname) || '/'

  const { href, as } = React.useMemo(() => {
    const resolvedHref = resolveHref(pathname, props.href)
    return {
      href: resolvedHref,
      as: props.as ? resolveHref(pathname, props.as) : resolvedHref,
    }
  }, [pathname, props.href, props.as])

  React.useEffect(() => {
    if (p && IntersectionObserver && childElm && childElm.tagName) {
      // Join on an invalid URI character
      const isPrefetched = prefetched[href + '%' + as]
      if (!isPrefetched) {
        return listenToIntersections(childElm, () => {
          prefetch(router, href, as)
        })
      }
    }
  }, [p, childElm, href, as, router])

  let { children, replace, shallow, scroll } = props
  // Deprecated. Warning shown by propType check. If the children provided is a string (<Link>example</Link>) we wrap it in an <a> tag
  if (typeof children === 'string') {
    children = <a>{children}</a>
  }

  // This will return the first child, if multiple are provided it will throw an error
  const child: any = Children.only(children)
  const childProps: {
    onMouseEnter?: React.MouseEventHandler
    onClick: React.MouseEventHandler
    href?: string
    ref?: any
  } = {
    ref: (el: any) => {
      if (el) setChildElm(el)

      if (child && typeof child === 'object' && child.ref) {
        if (typeof child.ref === 'function') child.ref(el)
        else if (typeof child.ref === 'object') {
          child.ref.current = el
        }
      }
    },
    onClick: (e: React.MouseEvent) => {
      if (child.props && typeof child.props.onClick === 'function') {
        child.props.onClick(e)
      }
      if (!e.defaultPrevented) {
        linkClicked(e, router, href, as, replace, shallow, scroll)
      }
    },
  }

  if (p) {
    childProps.onMouseEnter = (e: React.MouseEvent) => {
      if (child.props && typeof child.props.onMouseEnter === 'function') {
        child.props.onMouseEnter(e)
      }
      prefetch(router, href, as, { priority: true })
    }
  }

  // If child is an <a> tag and doesn't have a href attribute, or if the 'passHref' property is
  // defined, we specify the current 'href', so that repetition is not needed by the user
  if (props.passHref || (child.type === 'a' && !('href' in child.props))) {
    childProps.href = addBasePath(as)
  }

  return React.cloneElement(child, childProps)
}

if (process.env.NODE_ENV === 'development') {
  const warn = execOnce(console.error)

  // This module gets removed by webpack.IgnorePlugin
  const PropTypes = require('prop-types')
  const exact = require('prop-types-exact')
  // @ts-ignore the property is supported, when declaring it on the class it outputs an extra bit of code which is not needed.
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
      (props: any, propName: string) => {
        const value = props[propName]

        if (typeof value === 'string') {
          warn(
            `Warning: You're using a string directly inside <Link>. This usage has been deprecated. Please add an <a> tag as child of <Link>`
          )
        }

        return null
      },
    ]).isRequired,
  })
}

export default Link
