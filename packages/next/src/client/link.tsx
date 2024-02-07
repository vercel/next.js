'use client'

import type {
  NextRouter,
  PrefetchOptions as RouterPrefetchOptions,
} from '../shared/lib/router/router'

import React from 'react'
import type { UrlObject } from 'url'
import { resolveHref } from './resolve-href'
import { isLocalURL } from '../shared/lib/router/utils/is-local-url'
import { formatUrl } from '../shared/lib/router/utils/format-url'
import { isAbsoluteUrl } from '../shared/lib/utils'
import { addLocale } from './add-locale'
import { RouterContext } from '../shared/lib/router-context.shared-runtime'
import { AppRouterContext } from '../shared/lib/app-router-context.shared-runtime'
import type {
  AppRouterInstance,
  PrefetchOptions as AppRouterPrefetchOptions,
} from '../shared/lib/app-router-context.shared-runtime'
import { useIntersection } from './use-intersection'
import { getDomainLocale } from './get-domain-locale'
import { addBasePath } from './add-base-path'
import { PrefetchKind } from './components/router-reducer/router-reducer-types'

type Url = string | UrlObject
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T]
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T]

type InternalLinkProps = {
  /**
   * The path or URL to navigate to. It can also be an object.
   *
   * @example https://nextjs.org/docs/api-reference/next/link#with-url-object
   */
  href: Url
  /**
   * Optional decorator for the path that will be shown in the browser URL bar. Before Next.js 9.5.3 this was used for dynamic routes, check our [previous docs](https://github.com/vercel/next.js/blob/v9.5.2/docs/api-reference/next/link.md#dynamic-routes) to see how it worked. Note: when this path differs from the one provided in `href` the previous `href`/`as` behavior is used as shown in the [previous docs](https://github.com/vercel/next.js/blob/v9.5.2/docs/api-reference/next/link.md#dynamic-routes).
   */
  as?: Url
  /**
   * Replace the current `history` state instead of adding a new url into the stack.
   *
   * @defaultValue `false`
   */
  replace?: boolean
  /**
   * Whether to override the default scroll behavior
   *
   * @example https://nextjs.org/docs/api-reference/next/link#disable-scrolling-to-the-top-of-the-page
   *
   * @defaultValue `true`
   */
  scroll?: boolean
  /**
   * Update the path of the current page without rerunning [`getStaticProps`](/docs/basic-features/data-fetching/get-static-props.md), [`getServerSideProps`](/docs/basic-features/data-fetching/get-server-side-props.md) or [`getInitialProps`](/docs/api-reference/data-fetching/get-initial-props.md).
   *
   * @defaultValue `false`
   */
  shallow?: boolean
  /**
   * Forces `Link` to send the `href` property to its child.
   *
   * @defaultValue `false`
   */
  passHref?: boolean
  /**
   * Prefetch the page in the background.
   * Any `<Link />` that is in the viewport (initially or through scroll) will be preloaded.
   * Prefetch can be disabled by passing `prefetch={false}`. When `prefetch` is set to `false`, prefetching will still occur on hover. Pages using [Static Generation](/docs/basic-features/data-fetching/get-static-props.md) will preload `JSON` files with the data for faster page transitions. Prefetching is only enabled in production.
   *
   * @defaultValue `true`
   */
  prefetch?: boolean
  /**
   * The active locale is automatically prepended. `locale` allows for providing a different locale.
   * When `false` `href` has to include the locale as the default behavior is disabled.
   */
  locale?: string | false
  /**
   * Enable legacy link behavior.
   * @defaultValue `false`
   * @see https://github.com/vercel/next.js/commit/489e65ed98544e69b0afd7e0cfc3f9f6c2b803b7
   */
  legacyBehavior?: boolean
  /**
   * Optional event handler for when the mouse pointer is moved onto Link
   */
  onMouseEnter?: React.MouseEventHandler<HTMLAnchorElement>
  /**
   * Optional event handler for when Link is touched.
   */
  onTouchStart?: React.TouchEventHandler<HTMLAnchorElement>
  /**
   * Optional event handler for when Link is clicked.
   */
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
}

// TODO-APP: Include the full set of Anchor props
// adding this to the publicly exported type currently breaks existing apps

// `RouteInferType` is a stub here to avoid breaking `typedRoutes` when the type
// isn't generated yet. It will be replaced when the webpack plugin runs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type LinkProps<RouteInferType = any> = InternalLinkProps
type LinkPropsRequired = RequiredKeys<LinkProps>
type LinkPropsOptional = OptionalKeys<InternalLinkProps>

type PrefetchOptions = RouterPrefetchOptions & {
  /**
   * bypassPrefetchedCheck will bypass the check to see if the `href` has
   * already been fetched.
   */
  bypassPrefetchedCheck?: boolean
}

const prefetched = new Set<string>()

function prefetch(
  router: NextRouter | AppRouterInstance,
  href: string,
  as: string,
  options: PrefetchOptions,
  appOptions: AppRouterPrefetchOptions,
  isAppRouter: boolean
): void {
  if (
    typeof window === 'undefined' ||
    // app-router supports external urls out of the box so it shouldn't short-circuit here as support for e.g. `replace` is added in the app-router.
    (!isAppRouter && !isLocalURL(href))
  ) {
    return
  }

  // We should only dedupe requests when experimental.optimisticClientCache is
  // disabled.
  if (!options.bypassPrefetchedCheck) {
    // Let the link's locale prop override the default router locale.
    // Otherwise fallback to the router's locale.
    const locale = options?.locale ?? (router as NextRouter)?.locale
    const prefetchedKey = href + '%' + as + '%' + locale

    // If we've already fetched the key, then don't prefetch it again!
    if (prefetched.has(prefetchedKey)) {
      return
    }

    // Mark this URL as prefetched.
    prefetched.add(prefetchedKey)
  }

  const prefetchPromise = isAppRouter
    ? (router as AppRouterInstance).prefetch(href, appOptions)
    : (router as NextRouter).prefetch(href, as, options)

  // Prefetch the JSON page if asked (only in the client)
  // We need to handle a prefetch error here since we may be
  // loading with priority which can reject but we don't
  // want to force navigation since this is only a prefetch
  Promise.resolve(prefetchPromise).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      // rethrow to show invalid URL errors
      throw err
    }
  })
}

function isModifiedEvent(event: React.MouseEvent): boolean {
  const eventTarget = event.currentTarget as HTMLAnchorElement | SVGAElement
  const target = eventTarget.getAttribute('target')
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
  router: NextRouter | AppRouterInstance,
  href: string,
  as: string,
  replace?: boolean,
  shallow?: boolean,
  scroll?: boolean,
  locale?: string | false,
  isAppRouter?: boolean,
  isPrefetchEnabled?: boolean
): void {
  const { nodeName } = e.currentTarget

  // anchors inside an svg have a lowercase nodeName
  const isAnchorNodeName = nodeName.toUpperCase() === 'A'
  // app-router supports external urls out of the box so it shouldn't short-circuit here as support for e.g. `replace` is added in the app-router.
  const isPagesExternalUrl = !isAppRouter && !isLocalURL(href)

  if (isAnchorNodeName && (isModifiedEvent(e) || isPagesExternalUrl)) {
    // ignore click for browser’s default behavior
    return
  }

  e.preventDefault()

  const navigate = () => {
    // If the router is an NextRouter instance it will have `beforePopState`
    const routerScroll = scroll ?? true
    const routerMethod = router[replace ? 'replace' : 'push']

    if ('beforePopState' in router) {
      routerMethod(href, as, {
        shallow,
        locale,
        scroll: routerScroll,
      })
    } else {
      routerMethod(as || href, {
        forceOptimisticNavigation: !isPrefetchEnabled,
        scroll: routerScroll,
      })
    }
  }

  return isAppRouter ? React.startTransition(navigate) : navigate()
}

function formatStringOrUrl(urlObjOrString: UrlObject | string): string {
  return typeof urlObjOrString === 'string'
    ? urlObjOrString
    : formatUrl(urlObjOrString)
}

type LinkPropsReal = React.PropsWithChildren<
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
    LinkProps
>
/**
 * A React component that extends the HTML `<a>` element to provide [prefetching](https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#2-prefetching)
 * and client-side navigation between routes.
 *
 * It is the primary way to navigate between routes in Next.js.
 *
 * Read more: [Next.js docs: `<Link>`](https://nextjs.org/docs/app/api-reference/components/link)
 */
const Link = React.forwardRef<HTMLAnchorElement, LinkPropsReal>(
  function LinkComponent(props, forwardedRef) {
    const {
      href: hrefProp,
      as: asProp,
      children: childrenProp,
      prefetch: prefetchProp = null,
      passHref,
      replace,
      shallow,
      scroll,
      locale,
      onClick,
      onMouseEnter: onMouseEnterProp,
      onTouchStart: onTouchStartProp,
      legacyBehavior = false,
      ...restProps
    } = props

    let children = childrenProp

    if (
      legacyBehavior &&
      (typeof children === 'string' || typeof children === 'number')
    ) {
      children = <a>{children}</a>
    }

    const pagesRouter = React.useContext(RouterContext)
    const appRouter = React.useContext(AppRouterContext)
    const router = pagesRouter ?? appRouter

    // We're in the app directory if there is no pages router.
    const isAppRouter = !pagesRouter
    const isPrefetchEnabled = prefetchProp !== false

    /**
     * The possible states for prefetch are:
     * - null: this is the default "auto" mode, where we will prefetch partially if the link is in the viewport
     * - true: we will prefetch if the link is visible and prefetch the full page, not just partially
     * - false: we will not prefetch if in the viewport at all
     */
    const appPrefetchKind =
      prefetchProp === null ? PrefetchKind.AUTO : PrefetchKind.FULL

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

      const requiredProps = Object.keys(
        requiredPropsGuard
      ) as LinkPropsRequired[]

      requiredProps.forEach((key: LinkPropsRequired) => {
        const valueDataType = typeof props[key]
        const isValueNull = props[key] === null

        if (key !== 'href') {
          return
        }

        if (
          isValueNull ||
          (valueDataType !== 'string' && valueDataType !== 'object')
        ) {
          throw createPropError({
            key,
            expected: '`string` or `object`',
            actual: isValueNull ? 'null' : valueDataType,
          })
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
        onClick: true,
        onMouseEnter: true,
        onTouchStart: true,
        legacyBehavior: true,
      } as const

      const optionalProps = Object.keys(
        optionalPropsGuard
      ) as LinkPropsOptional[]

      optionalProps.forEach((key: LinkPropsOptional) => {
        const value = props[key]
        const valueDataType = typeof value
        const createPropErrorArgs = {
          key,
          actual: valueDataType,
        }

        if (!value) {
          return
        }

        switch (key) {
          case 'as':
            if (valueDataType !== 'string' && valueDataType !== 'object') {
              throw createPropError({
                ...createPropErrorArgs,
                expected: '`string` or `object`',
              })
            }
            break

          case 'locale':
            if (valueDataType !== 'string') {
              throw createPropError({
                ...createPropErrorArgs,
                expected: '`string`',
              })
            }
            break

          case 'onClick':
          case 'onMouseEnter':
          case 'onTouchStart':
            if (valueDataType !== 'function') {
              throw createPropError({
                ...createPropErrorArgs,
                expected: '`function`',
              })
            }
            break

          case 'replace':
          case 'scroll':
          case 'shallow':
          case 'passHref':
          case 'legacyBehavior':
          case 'prefetch':
            if (valueDataType !== 'boolean') {
              throw createPropError({
                ...createPropErrorArgs,
                expected: '`boolean`',
              })
            }
            break

          default:
            break
        }
      })

      // This hook is in a conditional but that is ok because `process.env.NODE_ENV` never changes
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const hasWarned = React.useRef(false)
      if (props.prefetch && !hasWarned.current && !isAppRouter) {
        hasWarned.current = true
        console.warn(
          'Next.js auto-prefetches automatically based on viewport. The prefetch attribute is no longer needed. More: https://nextjs.org/docs/messages/prefetch-true-deprecated'
        )
      }
    }

    if (process.env.NODE_ENV !== 'production' && isAppRouter && !asProp) {
      let href: string | undefined

      if (typeof hrefProp === 'string') {
        href = hrefProp
      } else if (
        typeof hrefProp === 'object' &&
        typeof hrefProp.pathname === 'string'
      ) {
        href = hrefProp.pathname
      }

      if (href) {
        const hasDynamicSegment = href
          .split('/')
          .some((segment) => segment.startsWith('[') && segment.endsWith(']'))

        if (hasDynamicSegment) {
          throw new Error(
            `Dynamic href \`${href}\` found in <Link> while using the \`/app\` router, this is not supported. Read more: https://nextjs.org/docs/messages/app-dir-dynamic-href`
          )
        }
      }
    }

    const { href, as } = React.useMemo(() => {
      if (isAppRouter) {
        const resolvedHref = formatStringOrUrl(hrefProp)
        const resolvedAs = formatStringOrUrl(asProp as Url)

        return {
          href: resolvedHref,
          as: asProp ? resolvedAs : resolvedHref,
        }
      }

      const [resolvedHref, resolvedAs] = resolveHref(
        pagesRouter,
        hrefProp,
        true
      )

      return {
        href: resolvedHref,
        as: asProp
          ? resolveHref(pagesRouter, asProp)
          : resolvedAs || resolvedHref,
      }
    }, [pagesRouter, hrefProp, asProp])

    const previousHref = React.useRef<string>(href)
    const previousAs = React.useRef<string>(as)

    // This will return the first child, if multiple are provided it will throw an error
    let child: any

    if (legacyBehavior) {
      if (process.env.NODE_ENV === 'development') {
        if (onClick) {
          console.warn(
            `"onClick" was passed to <Link> with \`href\` of \`${hrefProp}\` but "legacyBehavior" was set. The legacy behavior requires onClick be set on the child of next/link`
          )
        }
        if (onMouseEnterProp) {
          console.warn(
            `"onMouseEnter" was passed to <Link> with \`href\` of \`${hrefProp}\` but "legacyBehavior" was set. The legacy behavior requires onMouseEnter be set on the child of next/link`
          )
        }

        try {
          child = React.Children.only(children)
        } catch (err) {
          if (!children) {
            throw new Error(
              `No children were passed to <Link> with \`href\` of \`${hrefProp}\` but one child is required https://nextjs.org/docs/messages/link-no-children`
            )
          }
          throw new Error(
            `Multiple children were passed to <Link> with \`href\` of \`${hrefProp}\` but only one child is supported https://nextjs.org/docs/messages/link-multiple-children` +
              (typeof window !== 'undefined'
                ? " \nOpen your browser's console to view the Component stack trace."
                : '')
          )
        }
      } else {
        child = React.Children.only(children)
      }
    } else if (
      process.env.NODE_ENV === 'development' &&
      (children as any)?.type === 'a'
    ) {
      throw new Error(
        'Invalid <Link> with <a> child. Please remove <a> or use <Link legacyBehavior>.\nLearn more: https://nextjs.org/docs/messages/invalid-new-link-with-extra-anchor'
      )
    }

    const childRef: any = legacyBehavior
      ? child && typeof child === 'object' && child.ref
      : forwardedRef

    const [setIntersectionRef, isVisible, resetVisible] = useIntersection({
      rootMargin: '200px',
    })

    const setRef = React.useCallback(
      (el: Element) => {
        // Before the link getting observed, check if visible state need to be reset
        if (previousAs.current !== as || previousHref.current !== href) {
          resetVisible()
          previousAs.current = as
          previousHref.current = href
        }

        setIntersectionRef(el)

        if (childRef) {
          if (typeof childRef === 'function') childRef(el)
          else if (typeof childRef === 'object') childRef.current = el
        }
      },
      [as, childRef, href, resetVisible, setIntersectionRef]
    )

    // Prefetch the URL if we haven't already and it's visible.
    React.useEffect(() => {
      if (
        // in dev, we only prefetch on hover to avoid wasting resources as the prefetch will trigger compiling the page.
        process.env.NODE_ENV !== 'production' ||
        !router ||
        !isVisible ||
        !isPrefetchEnabled // If we don't need to prefetch the URL, don't do prefetch.
      ) {
        return
      }

      // Prefetch the URL.
      prefetch(
        router,
        href,
        as,
        { locale },
        { kind: appPrefetchKind },
        isAppRouter
      )
    }, [
      as,
      href,
      isVisible,
      locale,
      isPrefetchEnabled,
      pagesRouter?.locale,
      router,
      isAppRouter,
      appPrefetchKind,
    ])

    const childProps: {
      onTouchStart: React.TouchEventHandler<HTMLAnchorElement>
      onMouseEnter: React.MouseEventHandler<HTMLAnchorElement>
      onClick: React.MouseEventHandler<HTMLAnchorElement>
      href?: string
      ref?: any
    } = {
      ref: setRef,
      onClick(e) {
        if (process.env.NODE_ENV !== 'production' && !e) {
          throw new Error(
            `Component rendered inside next/link has to pass click event to "onClick" prop.`
          )
        }

        if (!legacyBehavior && typeof onClick === 'function') {
          onClick(e)
        }

        if (
          legacyBehavior &&
          child.props &&
          typeof child.props.onClick === 'function'
        ) {
          child.props.onClick(e)
        }

        if (!router || e.defaultPrevented) {
          return
        }

        linkClicked(
          e,
          router,
          href,
          as,
          replace,
          shallow,
          scroll,
          locale,
          isAppRouter,
          isPrefetchEnabled
        )
      },
      onMouseEnter(e) {
        if (!legacyBehavior && typeof onMouseEnterProp === 'function') {
          onMouseEnterProp(e)
        }

        if (
          legacyBehavior &&
          child.props &&
          typeof child.props.onMouseEnter === 'function'
        ) {
          child.props.onMouseEnter(e)
        }

        if (!router) {
          return
        }

        if (
          (!isPrefetchEnabled || process.env.NODE_ENV === 'development') &&
          isAppRouter
        ) {
          return
        }

        prefetch(
          router,
          href,
          as,
          {
            locale,
            priority: true,
            // @see {https://github.com/vercel/next.js/discussions/40268?sort=top#discussioncomment-3572642}
            bypassPrefetchedCheck: true,
          },
          { kind: appPrefetchKind },
          isAppRouter
        )
      },
      onTouchStart(e) {
        if (!legacyBehavior && typeof onTouchStartProp === 'function') {
          onTouchStartProp(e)
        }

        if (
          legacyBehavior &&
          child.props &&
          typeof child.props.onTouchStart === 'function'
        ) {
          child.props.onTouchStart(e)
        }

        if (!router || (!isPrefetchEnabled && isAppRouter)) {
          return
        }

        prefetch(
          router,
          href,
          as,
          {
            locale,
            priority: true,
            // @see {https://github.com/vercel/next.js/discussions/40268?sort=top#discussioncomment-3572642}
            bypassPrefetchedCheck: true,
          },
          { kind: appPrefetchKind },
          isAppRouter
        )
      },
    }

    // If child is an <a> tag and doesn't have a href attribute, or if the 'passHref' property is
    // defined, we specify the current 'href', so that repetition is not needed by the user.
    // If the url is absolute, we can bypass the logic to prepend the domain and locale.
    if (isAbsoluteUrl(as)) {
      childProps.href = as
    } else if (
      !legacyBehavior ||
      passHref ||
      (child.type === 'a' && !('href' in child.props))
    ) {
      const curLocale = locale ?? pagesRouter?.locale

      // we only render domain locales if we are currently on a domain locale
      // so that locale links are still visitable in development/preview envs
      const localeDomain =
        pagesRouter?.isLocaleDomain &&
        getDomainLocale(
          as,
          curLocale,
          pagesRouter?.locales,
          pagesRouter?.domainLocales
        )

      childProps.href =
        localeDomain ||
        addBasePath(addLocale(as, curLocale, pagesRouter?.defaultLocale))
    }

    return legacyBehavior ? (
      React.cloneElement(child, childProps)
    ) : (
      <a {...restProps} {...childProps}>
        {' '}
        {children}{' '}
      </a>
    )
  }
)

export default Link
