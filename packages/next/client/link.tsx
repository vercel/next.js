import React, { Children } from 'react'
import { UrlObject } from 'url'
import {
  addBasePath,
  isLocalURL,
  NextRouter,
  PrefetchOptions,
  resolveHref,
} from '../next-server/lib/router/router'
import { useRouter } from './router'

type Url = string | UrlObject
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T]
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T]

export type LinkProps = {
  href: Url
  as?: Url
  replace?: boolean
  scroll?: boolean
  shallow?: boolean
  passHref?: boolean
  prefetch?: boolean
}
type LinkPropsRequired = RequiredKeys<LinkProps>
type LinkPropsOptional = OptionalKeys<LinkProps>

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
  if (!isLocalURL(href)) return
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

function isModifiedEvent(event: React.MouseEvent) {
  const { target } = event.currentTarget as HTMLAnchorElement
  return (
    (target && target !== '_self') ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey || // triggers resource download
    (event.nativeEvent && event.nativeEvent.which === 2)
  )
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
  const { nodeName } = e.currentTarget

  if (nodeName === 'A' && (isModifiedEvent(e) || !isLocalURL(href))) {
    // ignore click for browser’s default behavior
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
    function createPropError(args: {
      key: string
      expected: string
      actual: string
    }) {
      return new Error(
        `Failed prop type: The prop \`${args.key}\` expects a ${args.expected} in \`<Link>\`, but got \`${args.actual}\` instead.` +
          (typeof window !== 'undefined'
            ? "\nOpen your browser's console to view the Component stack trace."
            : '')
      )
    }

    // TypeScript trick for type-guarding:
    const requiredPropsGuard: Record<LinkPropsRequired, true> = {
      href: true,
    } as const
    const requiredProps: LinkPropsRequired[] = Object.keys(
      requiredPropsGuard
    ) as LinkPropsRequired[]
    requiredProps.forEach((key: LinkPropsRequired) => {
      if (key === 'href') {
        if (
          props[key] == null ||
          (typeof props[key] !== 'string' && typeof props[key] !== 'object')
        ) {
          throw createPropError({
            key,
            expected: '`string` or `object`',
            actual: props[key] === null ? 'null' : typeof props[key],
          })
        }
      } else {
        // TypeScript trick for type-guarding:
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _: never = key
      }
    })

    // TypeScript trick for type-guarding:
    const optionalPropsGuard: Record<LinkPropsOptional, true> = {
      as: true,
      replace: true,
      scroll: true,
      shallow: true,
      passHref: true,
      prefetch: true,
    } as const
    const optionalProps: LinkPropsOptional[] = Object.keys(
      optionalPropsGuard
    ) as LinkPropsOptional[]
    optionalProps.forEach((key: LinkPropsOptional) => {
      if (key === 'as') {
        if (
          props[key] &&
          typeof props[key] !== 'string' &&
          typeof props[key] !== 'object'
        ) {
          throw createPropError({
            key,
            expected: '`string` or `object`',
            actual: typeof props[key],
          })
        }
      } else if (
        key === 'replace' ||
        key === 'scroll' ||
        key === 'shallow' ||
        key === 'passHref' ||
        key === 'prefetch'
      ) {
        if (props[key] != null && typeof props[key] !== 'boolean') {
          throw createPropError({
            key,
            expected: '`boolean`',
            actual: typeof props[key],
          })
        }
      } else {
        // TypeScript trick for type-guarding:
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _: never = key
      }
    })

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
    const [resolvedHref, resolvedAs] = resolveHref(pathname, props.href, true)
    return {
      href: resolvedHref,
      as: props.as
        ? resolveHref(pathname, props.as)
        : resolvedAs || resolvedHref,
    }
  }, [pathname, props.href, props.as])

  React.useEffect(() => {
    if (
      p &&
      IntersectionObserver &&
      childElm &&
      childElm.tagName &&
      isLocalURL(href)
    ) {
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
      if (!isLocalURL(href)) return
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

export default Link
