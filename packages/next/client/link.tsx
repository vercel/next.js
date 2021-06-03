import React, { Children, useEffect } from 'react'
import { UrlObject } from 'url'
import {
  addBasePath,
  addLocale,
  getDomainLocale,
  isLocalURL,
  NextRouter,
  PrefetchOptions,
  resolveHref,
} from '../next-server/lib/router/router'
import { useRouter } from './router'
import { useIntersection } from './use-intersection'

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
  locale?: string | false
}
type LinkPropsRequired = RequiredKeys<LinkProps>
type LinkPropsOptional = OptionalKeys<LinkProps>

const prefetched: { [cacheKey: string]: boolean } = {}

function prefetch(
  router: NextRouter,
  href: string,
  as: string,
  options?: PrefetchOptions
): void {
  if (typeof window === 'undefined' || !router) return
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
  const curLocale =
    options && typeof options.locale !== 'undefined'
      ? options.locale
      : router && router.locale

  // Join on an invalid URI character
  prefetched[href + '%' + as + (curLocale ? '%' + curLocale : '')] = true
}

function isModifiedEvent(event: React.MouseEvent): boolean {
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
  scroll?: boolean,
  locale?: string | false
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
  router[replace ? 'replace' : 'push'](href, as, {
    shallow,
    locale,
    scroll,
  })
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
      locale: true,
    } as const
    const optionalProps: LinkPropsOptional[] = Object.keys(
      optionalPropsGuard
    ) as LinkPropsOptional[]
    optionalProps.forEach((key: LinkPropsOptional) => {
      const valType = typeof props[key]

      if (key === 'as') {
        if (props[key] && valType !== 'string' && valType !== 'object') {
          throw createPropError({
            key,
            expected: '`string` or `object`',
            actual: valType,
          })
        }
      } else if (key === 'locale') {
        if (props[key] && valType !== 'string') {
          throw createPropError({
            key,
            expected: '`string`',
            actual: valType,
          })
        }
      } else if (
        key === 'replace' ||
        key === 'scroll' ||
        key === 'shallow' ||
        key === 'passHref' ||
        key === 'prefetch'
      ) {
        if (props[key] != null && valType !== 'boolean') {
          throw createPropError({
            key,
            expected: '`boolean`',
            actual: valType,
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
        'Next.js auto-prefetches automatically based on viewport. The prefetch attribute is no longer needed. More: https://nextjs.org/docs/messages/prefetch-true-deprecated'
      )
    }
  }
  const p = props.prefetch !== false
  const router = useRouter()

  const { href, as } = React.useMemo(() => {
    const [resolvedHref, resolvedAs] = resolveHref(router, props.href, true)
    return {
      href: resolvedHref,
      as: props.as ? resolveHref(router, props.as) : resolvedAs || resolvedHref,
    }
  }, [router, props.href, props.as])

  let { children, replace, shallow, scroll, locale } = props

  // Deprecated. Warning shown by propType check. If the children provided is a string (<Link>example</Link>) we wrap it in an <a> tag
  if (typeof children === 'string') {
    children = <a>{children}</a>
  }

  // This will return the first child, if multiple are provided it will throw an error
  let child: any
  if (process.env.NODE_ENV === 'development') {
    try {
      child = Children.only(children)
    } catch (err) {
      throw new Error(
        `Multiple children were passed to <Link> with \`href\` of \`${props.href}\` but only one child is supported https://nextjs.org/docs/messages/link-multiple-children` +
          (typeof window !== 'undefined'
            ? "\nOpen your browser's console to view the Component stack trace."
            : '')
      )
    }
  } else {
    child = Children.only(children)
  }
  const childRef: any = child && typeof child === 'object' && child.ref

  const [setIntersectionRef, isVisible] = useIntersection({
    rootMargin: '200px',
  })
  const setRef = React.useCallback(
    (el: Element) => {
      setIntersectionRef(el)
      if (childRef) {
        if (typeof childRef === 'function') childRef(el)
        else if (typeof childRef === 'object') {
          childRef.current = el
        }
      }
    },
    [childRef, setIntersectionRef]
  )
  useEffect(() => {
    const shouldPrefetch = isVisible && p && isLocalURL(href)
    const curLocale =
      typeof locale !== 'undefined' ? locale : router && router.locale
    const isPrefetched =
      prefetched[href + '%' + as + (curLocale ? '%' + curLocale : '')]
    if (shouldPrefetch && !isPrefetched) {
      prefetch(router, href, as, {
        locale: curLocale,
      })
    }
  }, [as, href, isVisible, locale, p, router])

  const childProps: {
    onMouseEnter?: React.MouseEventHandler
    onClick: React.MouseEventHandler
    href?: string
    ref?: any
  } = {
    ref: setRef,
    onClick: (e: React.MouseEvent) => {
      if (child.props && typeof child.props.onClick === 'function') {
        child.props.onClick(e)
      }
      if (!e.defaultPrevented) {
        linkClicked(e, router, href, as, replace, shallow, scroll, locale)
      }
    },
  }

  childProps.onMouseEnter = (e: React.MouseEvent) => {
    if (!isLocalURL(href)) return
    if (child.props && typeof child.props.onMouseEnter === 'function') {
      child.props.onMouseEnter(e)
    }
    prefetch(router, href, as, { priority: true })
  }

  // If child is an <a> tag and doesn't have a href attribute, or if the 'passHref' property is
  // defined, we specify the current 'href', so that repetition is not needed by the user
  if (props.passHref || (child.type === 'a' && !('href' in child.props))) {
    const curLocale =
      typeof locale !== 'undefined' ? locale : router && router.locale

    // we only render domain locales if we are currently on a domain locale
    // so that locale links are still visitable in development/preview envs
    const localeDomain =
      router &&
      router.isLocaleDomain &&
      getDomainLocale(
        as,
        curLocale,
        router && router.locales,
        router && router.domainLocales
      )

    childProps.href =
      localeDomain ||
      addBasePath(addLocale(as, curLocale, router && router.defaultLocale))
  }

  return React.cloneElement(child, childProps)
}

export default Link
