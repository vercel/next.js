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
import { warnOnce } from '../shared/lib/utils/warn-once'

type Url = string | UrlObject

type InternalLinkProps = {
  /**
   * The path or URL to navigate to. It can also be an object.
   *
   * @example https://nextjs.org/docs/api-reference/next/link#with-url-object
   */
  href: Url
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
   * Update the path of the current page without rerunning [`getStaticProps`](/docs/pages/building-your-application/data-fetching/get-static-props), [`getServerSideProps`](/docs/pages/building-your-application/data-fetching/get-server-side-props) or [`getInitialProps`](/docs/pages/api-reference/functions/get-initial-props).
   *
   * @defaultValue `false`
   */
  shallow?: boolean
  /**
   * Prefetch the page in the background.
   * Any `<Link />` that is in the viewport (initially or through scroll) will be preloaded.
   * Prefetch can be disabled by passing `prefetch={false}`. When `prefetch` is set to `false`, prefetching will still occur on hover in pages router but not in app router. Pages using [Static Generation](/docs/basic-features/data-fetching/get-static-props.md) will preload `JSON` files with the data for faster page transitions. Prefetching is only enabled in production.
   *
   * @defaultValue `true`
   */
  prefetch?: boolean
  /**
   * The active locale is automatically prepended. `locale` allows for providing a different locale.
   * When `false` `href` has to include the locale as the default behavior is disabled.
   */
  locale?: string | false

  // --- legacy behaviors ---
  /**
   * Enable legacy link behavior.
   * @defaultValue `false`
   * @see https://github.com/vercel/next.js/commit/489e65ed98544e69b0afd7e0cfc3f9f6c2b803b7
   */
  legacyBehavior?: boolean
  /**
   * Forces `Link` to send the `href` property to its child.
   *
   * @defaultValue `false`
   */
  passHref?: boolean
  /**
   * Optional decorator for the path that will be shown in the browser URL bar. Before Next.js 9.5.3 this was used for dynamic routes, check our [previous docs](https://github.com/vercel/next.js/blob/v9.5.2/docs/api-reference/next/link.md#dynamic-routes) to see how it worked. Note: when this path differs from the one provided in `href` the previous `href`/`as` behavior is used as shown in the [previous docs](https://github.com/vercel/next.js/blob/v9.5.2/docs/api-reference/next/link.md#dynamic-routes).
   */
  as?: Url
}

// `RouteInferType` is a stub here to avoid breaking `typedRoutes` when the type
// isn't generated yet. It will be replaced when the webpack plugin runs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type LinkProps<RouteInferType = any> = React.PropsWithChildren<
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof InternalLinkProps> &
    InternalLinkProps
>

const prefetched = new Set<string>()

type PrefetchOptions = RouterPrefetchOptions & {
  /**
   * bypassPrefetchedCheck will bypass the check to see if the `href` has
   * already been fetched.
   */
  bypassPrefetchedCheck?: boolean
}

function prefetch(
  router: NextRouter | AppRouterInstance,
  href: string,
  as: string,
  options: PrefetchOptions,
  appOptions: AppRouterPrefetchOptions,
  isAppRouter: boolean
): void {
  if (typeof window === 'undefined') {
    return
  }

  // app-router supports external urls out of the box so it shouldn't short-circuit here as support for e.g. `replace` is added in the app-router.
  if (!isAppRouter && !isLocalURL(href)) {
    return
  }

  // dedupe requests
  if (!options.bypassPrefetchedCheck) {
    const routerLocale = 'locale' in router ? router.locale : undefined
    const locale = options.locale ?? routerLocale

    const prefetchedKey = href + '%' + as + '%' + locale

    // Use cached result
    if (prefetched.has(prefetchedKey)) {
      return
    }

    prefetched.add(prefetchedKey)
  }

  const doPrefetch = async () => {
    if (isAppRouter) {
      // note that `appRouter.prefetch()` is currently sync,
      // so we have to wrap this call in an async function to be able to catch() errors below.
      return (router as AppRouterInstance).prefetch(href, appOptions)
    } else {
      return (router as NextRouter).prefetch(href, as, options)
    }
  }

  // Prefetch the JSON page if asked (only in the client)
  // We need to handle a prefetch error here since we may be
  // loading with priority which can reject but we don't
  // want to force navigation since this is only a prefetch
  doPrefetch().catch((err) => {
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

function linkHover(
  router: NextRouter | AppRouterInstance,
  href: string,
  as: string,
  locale: string | false | undefined,
  prefetchEnabled: boolean,
  prefetchKind: PrefetchKind,
  isAppRouter: boolean
) {
  if (!prefetchEnabled && isAppRouter) {
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
    {
      kind: prefetchKind,
    },
    isAppRouter
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
  isAppRouter?: boolean
): void {
  const { nodeName } = e.currentTarget

  // anchors inside an svg have a lowercase nodeName
  const isAnchorNodeName = nodeName.toUpperCase() === 'A'

  if (
    isAnchorNodeName &&
    (isModifiedEvent(e) ||
      // app-router supports external urls out of the box so it shouldn't short-circuit here as support for e.g. `replace` is added in the app-router.
      (!isAppRouter && !isLocalURL(href)))
  ) {
    // ignore click for browser’s default behavior
    return
  }

  e.preventDefault()

  const navigate = () => {
    // If the router is an NextRouter instance it will have `beforePopState`
    const routerScroll = scroll ?? true
    if ('beforePopState' in router) {
      router[replace ? 'replace' : 'push'](href, as, {
        shallow,
        locale,
        scroll: routerScroll,
      })
    } else {
      router[replace ? 'replace' : 'push'](as || href, {
        scroll: routerScroll,
      })
    }
  }

  if (isAppRouter) {
    React.startTransition(navigate)
  } else {
    navigate()
  }
}

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

function formatStringOrUrl(urlObjOrString: UrlObject | string): string {
  if (typeof urlObjOrString === 'string') {
    return urlObjOrString
  }

  return formatUrl(urlObjOrString)
}

/**
 * A React component that extends the HTML `<a>` element to provide [prefetching](https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#2-prefetching)
 * and client-side navigation between routes.
 *
 * It is the primary way to navigate between routes in Next.js.
 *
 * Read more: [Next.js docs: `<Link>`](https://nextjs.org/docs/app/api-reference/components/link)
 */
const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
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

    const prefetchEnabled = prefetchProp !== false
    /**
     * The possible states for prefetch are:
     * - null: this is the default "auto" mode, where we will prefetch partially if the link is in the viewport
     * - true: we will prefetch if the link is visible and prefetch the full page, not just partially
     * - false: we will not prefetch if in the viewport at all
     */
    const appPrefetchKind =
      prefetchProp === null ? PrefetchKind.AUTO : PrefetchKind.FULL

    if (process.env.NODE_ENV !== 'production') {
      if (
        props.href == null ||
        (typeof props.href !== 'string' && typeof props.href !== 'object')
      ) {
        throw createPropError({
          key: 'href',
          expected: '`string` or `object`',
          actual: props.href === null ? 'null' : typeof props.href,
        })
      }

      ;(Object.keys(props) as (keyof InternalLinkProps)[]).forEach((key) => {
        const valType = typeof props[key]
        // ignore nullish value on optional props
        if (props[key] == null) return

        switch (key) {
          case 'as':
            if (valType !== 'string' && valType !== 'object') {
              throw createPropError({
                key,
                expected: '`string` or `object`',
                actual: valType,
              })
            }
            break
          case 'replace':
          case 'scroll':
          case 'shallow':
          case 'passHref':
          case 'prefetch':
          case 'legacyBehavior':
            if (valType !== 'boolean') {
              throw createPropError({
                key,
                expected: '`boolean`',
                actual: valType,
              })
            }
            break
          default:
          // required & unchecked keys
        }
      })

      if (props.prefetch && !isAppRouter) {
        warnOnce(
          'Next.js auto-prefetches automatically based on viewport. The prefetch attribute is no longer needed. More: https://nextjs.org/docs/messages/prefetch-true-deprecated'
        )
      }
    }

    const { href, as } = React.useMemo(() => {
      if (!pagesRouter) {
        const resolvedHref = formatStringOrUrl(hrefProp)
        return {
          href: resolvedHref,
          as: asProp ? formatStringOrUrl(asProp) : resolvedHref,
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

    // the child anchor (if legacy behavior enabled)
    let legacyChild:
      | React.ReactElement<React.ComponentProps<'a'>, 'a'>
      | undefined

    if (legacyBehavior) {
      if (process.env.NODE_ENV === 'development') {
        if (onClick) {
          warnOnce(
            `"onClick" was passed to <Link> with \`href\` of \`${hrefProp}\` but "legacyBehavior" was set. The legacy behavior requires onClick be set on the child of next/link`
          )
        }
        if (onMouseEnterProp) {
          warnOnce(
            `"onMouseEnter" was passed to <Link> with \`href\` of \`${hrefProp}\` but "legacyBehavior" was set. The legacy behavior requires onMouseEnter be set on the child of next/link`
          )
        }

        if (!children) {
          throw new Error(
            `No children were passed to <Link> with \`href\` of \`${hrefProp}\` but one child is required https://nextjs.org/docs/messages/link-no-children`
          )
        }

        try {
          legacyChild = React.Children.only(children) as any
        } catch (err) {
          throw new Error(
            `Multiple children were passed to legacy <Link> with \`href\` of \`${hrefProp}\` but only one child is supported https://nextjs.org/docs/messages/link-multiple-children` +
              (typeof window !== 'undefined'
                ? " \nOpen your browser's console to view the Component stack trace."
                : '')
          )
        }
      } else {
        legacyChild = React.Children.only(children) as any
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        // dynamic href
        if (isAppRouter && !asProp) {
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
    }

    const childRef = legacyBehavior ? legacyChild?.props.ref : forwardedRef

    const [setIntersectionRef, isVisible] = useIntersection({
      rootMargin: '200px',
      // in dev, we only prefetch on hover to avoid wasting resources as the prefetch will trigger compiling the page.
      disabled: process.env.NODE_ENV === 'development',
    })

    const mergedRef = React.useCallback(
      (el: HTMLAnchorElement) => {
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

    // Prefetch the URL if we haven't already and it's visible.
    if (router && isVisible) {
      // prefetch is deduped by default
      // we don't need a hook to track the change of `isVisible` and other related properties.
      prefetch(
        router,
        href,
        as,
        { locale },
        {
          kind: appPrefetchKind,
        },
        isAppRouter
      )
    }

    const childProps: React.ComponentProps<'a'> = {
      ref: mergedRef,
      onClick(e) {
        if (!legacyBehavior) {
          onClick?.(e)
        }

        if (
          legacyChild?.props &&
          typeof legacyChild.props.onClick === 'function'
        ) {
          legacyChild.props.onClick(e)
        }

        if (!router) {
          return
        }

        if (e.defaultPrevented) {
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
          isAppRouter
        )
      },
      onMouseEnter(e) {
        if (!legacyBehavior) {
          onMouseEnterProp?.(e)
        }

        if (
          legacyChild?.props &&
          typeof legacyChild.props.onMouseEnter === 'function'
        ) {
          legacyChild.props.onMouseEnter(e)
        }

        if (!router) {
          return
        }

        linkHover(
          router,
          href,
          as,
          locale,
          prefetchEnabled,
          appPrefetchKind,
          isAppRouter
        )
      },
      onTouchStart: process.env.__NEXT_LINK_NO_TOUCH_START
        ? undefined
        : function onTouchStart(e) {
            if (!legacyBehavior) {
              onTouchStartProp?.(e)
            }

            if (
              legacyChild?.props &&
              typeof legacyChild.props.onTouchStart === 'function'
            ) {
              legacyChild.props.onTouchStart(e)
            }

            if (!router) {
              return
            }

            linkHover(
              router,
              href,
              as,
              locale,
              prefetchEnabled,
              appPrefetchKind,
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
      !legacyChild ||
      passHref ||
      (legacyChild.type === 'a' && !('href' in legacyChild.props))
    ) {
      const curLocale =
        typeof locale !== 'undefined' ? locale : pagesRouter?.locale

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

    return legacyChild ? (
      React.cloneElement(legacyChild, childProps)
    ) : (
      <a {...restProps} {...childProps}>
        {children}
      </a>
    )
  }
)

export default Link
