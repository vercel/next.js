'use client'

import type {
  NextRouter,
  PrefetchOptions as RouterPrefetchOptions,
} from '../shared/lib/router/router'

import React, { createContext, useContext } from 'react'
import type { UrlObject } from 'url'
import { resolveHref } from './resolve-href'
import { isLocalURL } from '../shared/lib/router/utils/is-local-url'
import { formatUrl } from '../shared/lib/router/utils/format-url'
import { isAbsoluteUrl } from '../shared/lib/utils'
import { addLocale } from './add-locale'
import { RouterContext } from '../shared/lib/router-context.shared-runtime'
import type { AppRouterInstance } from '../shared/lib/app-router-context.shared-runtime'
import { useIntersection } from './use-intersection'
import { getDomainLocale } from './get-domain-locale'
import { addBasePath } from './add-base-path'
import { useMergedRef } from './use-merged-ref'
import { errorOnce } from '../shared/lib/utils/error-once'

type Url = string | UrlObject
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T]
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T]

type OnNavigateEventHandler = (event: { preventDefault: () => void }) => void

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
   * Update the path of the current page without rerunning [`getStaticProps`](https://nextjs.org/docs/pages/building-your-application/data-fetching/get-static-props), [`getServerSideProps`](https://nextjs.org/docs/pages/building-your-application/data-fetching/get-server-side-props) or [`getInitialProps`](/docs/pages/api-reference/functions/get-initial-props).
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
   * Any `<Link />` that is in the viewport (initially or through scroll) will be prefetched.
   * Prefetch can be disabled by passing `prefetch={false}`. Prefetching is only enabled in production.
   *
   * In App Router:
   * - "auto", null, undefined (default): For statically generated pages, this will prefetch the full React Server Component data. For dynamic pages, this will prefetch up to the nearest route segment with a [`loading.js`](https://nextjs.org/docs/app/api-reference/file-conventions/loading) file. If there is no loading file, it will not fetch the full tree to avoid fetching too much data.
   * - `true`: This will prefetch the full React Server Component data for all route segments, regardless of whether they contain a segment with `loading.js`.
   * - `false`: This will not prefetch any data, even on hover.
   *
   * In Pages Router:
   * - `true` (default): The full route & its data will be prefetched.
   * - `false`: Prefetching will not happen when entering the viewport, but will still happen on hover.
   * @defaultValue `true` (pages router) or `null` (app router)
   */
  prefetch?: boolean | 'auto' | null | 'unstable_forceStale'
  /**
   * The active locale is automatically prepended. `locale` allows for providing a different locale.
   * When `false` `href` has to include the locale as the default behavior is disabled.
   * Note: This is only available in the Pages Router.
   */
  locale?: string | false
  /**
   * Enable legacy link behavior.
   *
   * @deprecated This will be removed in a future version
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
  /**
   * Optional event handler for when the `<Link>` is navigated.
   */
  onNavigate?: OnNavigateEventHandler
}

// TODO-APP: Include the full set of Anchor props
// adding this to the publicly exported type currently breaks existing apps

// `RouteInferType` is a stub here to avoid breaking `typedRoutes` when the type
// isn't generated yet. It will be replaced when type generation runs.
// WARNING: This should be an interface to prevent TypeScript from inlining it
// in declarations of libraries dependending on Next.js.
// Not trivial to reproduce so only convert to an interface when needed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface LinkProps<RouteInferType = any> extends InternalLinkProps {}
type LinkPropsRequired = RequiredKeys<LinkProps>
type LinkPropsOptional = OptionalKeys<InternalLinkProps>

const prefetched = new Set<string>()

type PrefetchOptions = RouterPrefetchOptions & {
  /**
   * bypassPrefetchedCheck will bypass the check to see if the `href` has
   * already been fetched.
   */
  bypassPrefetchedCheck?: boolean
}

function prefetch(
  router: NextRouter,
  href: string,
  as: string,
  options: PrefetchOptions
): void {
  if (typeof window === 'undefined') {
    return
  }

  if (!isLocalURL(href)) {
    return
  }

  // We should only dedupe requests when experimental.optimisticClientCache is
  // disabled.
  if (!options.bypassPrefetchedCheck) {
    const locale =
      // Let the link's locale prop override the default router locale.
      typeof options.locale !== 'undefined'
        ? options.locale
        : // Otherwise fallback to the router's locale.
          'locale' in router
          ? router.locale
          : undefined

    const prefetchedKey = href + '%' + as + '%' + locale

    // If we've already fetched the key, then don't prefetch it again!
    if (prefetched.has(prefetchedKey)) {
      return
    }

    // Mark this URL as prefetched.
    prefetched.add(prefetchedKey)
  }

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
  onNavigate?: OnNavigateEventHandler
): void {
  const { nodeName } = e.currentTarget

  // anchors inside an svg have a lowercase nodeName
  const isAnchorNodeName = nodeName.toUpperCase() === 'A'

  if (
    (isAnchorNodeName && isModifiedEvent(e)) ||
    e.currentTarget.hasAttribute('download')
  ) {
    // ignore click for browser’s default behavior
    return
  }

  if (!isLocalURL(href)) {
    if (replace) {
      // browser default behavior does not replace the history state
      // so we need to do it manually
      e.preventDefault()
      location.replace(href)
    }

    // ignore click for browser’s default behavior
    return
  }

  e.preventDefault()

  const navigate = () => {
    if (onNavigate) {
      let isDefaultPrevented = false

      onNavigate({
        preventDefault: () => {
          isDefaultPrevented = true
        },
      })

      if (isDefaultPrevented) {
        return
      }
    }

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

  navigate()
}

type LinkPropsReal = React.PropsWithChildren<
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
    LinkProps
>

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
const Link = React.forwardRef<HTMLAnchorElement, LinkPropsReal>(
  function LinkComponent(props, forwardedRef) {
    let children: React.ReactNode

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
      onNavigate,
      onMouseEnter: onMouseEnterProp,
      onTouchStart: onTouchStartProp,
      legacyBehavior = false,
      ...restProps
    } = props

    children = childrenProp

    if (
      legacyBehavior &&
      (typeof children === 'string' || typeof children === 'number')
    ) {
      children = <a>{children}</a>
    }

    const router = React.useContext(RouterContext)

    const prefetchEnabled = prefetchProp !== false

    if (process.env.NODE_ENV !== 'production') {
      function createPropError(args: {
        key: string
        expected: string
        actual: string
      }) {
        return new Error(
          `Failed prop type: The prop \`${args.key}\` expects a ${args.expected} in \`<Link>\`, but got \`${args.actual}\` instead.` +
            (typeof window !== 'undefined'
              ? // TODO: Remove this addendum if Owner Stacks are available
                "\nOpen your browser's console to view the Component stack trace."
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
        onClick: true,
        onMouseEnter: true,
        onTouchStart: true,
        legacyBehavior: true,
        onNavigate: true,
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
          key === 'onClick' ||
          key === 'onMouseEnter' ||
          key === 'onTouchStart' ||
          key === 'onNavigate'
        ) {
          if (props[key] && valType !== 'function') {
            throw createPropError({
              key,
              expected: '`function`',
              actual: valType,
            })
          }
        } else if (
          key === 'replace' ||
          key === 'scroll' ||
          key === 'shallow' ||
          key === 'passHref' ||
          key === 'legacyBehavior'
        ) {
          if (props[key] != null && valType !== 'boolean') {
            throw createPropError({
              key,
              expected: '`boolean`',
              actual: valType,
            })
          }
        } else if (key === 'prefetch') {
          if (
            props[key] != null &&
            valType !== 'boolean' &&
            props[key] !== 'auto'
          ) {
            throw createPropError({
              key,
              expected: '`boolean | "auto"`',
              actual: valType,
            })
          }
        } else {
          // TypeScript trick for type-guarding:
          const _: never = key
        }
      })
    }

    const { href, as } = React.useMemo(() => {
      if (!router) {
        const resolvedHref = formatStringOrUrl(hrefProp)
        return {
          href: resolvedHref,
          as: asProp ? formatStringOrUrl(asProp) : resolvedHref,
        }
      }

      const [resolvedHref, resolvedAs] = resolveHref(router, hrefProp, true)

      return {
        href: resolvedHref,
        as: asProp ? resolveHref(router, asProp) : resolvedAs || resolvedHref,
      }
    }, [router, hrefProp, asProp])

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
    } else {
      if (process.env.NODE_ENV === 'development') {
        if ((children as any)?.type === 'a') {
          throw new Error(
            'Invalid <Link> with <a> child. Please remove <a> or use <Link legacyBehavior>.\nLearn more: https://nextjs.org/docs/messages/invalid-new-link-with-extra-anchor'
          )
        }
      }
    }

    const childRef: any = legacyBehavior
      ? child && typeof child === 'object' && child.ref
      : forwardedRef

    const [setIntersectionRef, isVisible, resetVisible] = useIntersection({
      rootMargin: '200px',
    })
    const setIntersectionWithResetRef = React.useCallback(
      (el: Element | null) => {
        // Before the link getting observed, check if visible state need to be reset
        if (previousAs.current !== as || previousHref.current !== href) {
          resetVisible()
          previousAs.current = as
          previousHref.current = href
        }

        setIntersectionRef(el)
      },
      [as, href, resetVisible, setIntersectionRef]
    )

    const setRef = useMergedRef(setIntersectionWithResetRef, childRef)

    // Prefetch the URL if we haven't already and it's visible.
    React.useEffect(() => {
      // in dev, we only prefetch on hover to avoid wasting resources as the prefetch will trigger compiling the page.
      if (process.env.NODE_ENV !== 'production') {
        return
      }

      if (!router) {
        return
      }

      // If we don't need to prefetch the URL, don't do prefetch.
      if (!isVisible || !prefetchEnabled) {
        return
      }

      // Prefetch the URL.
      prefetch(router, href, as, { locale })
    }, [as, href, isVisible, locale, prefetchEnabled, router?.locale, router])

    const childProps: {
      onTouchStart?: React.TouchEventHandler<HTMLAnchorElement>
      onMouseEnter: React.MouseEventHandler<HTMLAnchorElement>
      onClick: React.MouseEventHandler<HTMLAnchorElement>
      href?: string
      ref?: any
    } = {
      ref: setRef,
      onClick(e) {
        if (process.env.NODE_ENV !== 'production') {
          if (!e) {
            throw new Error(
              `Component rendered inside next/link has to pass click event to "onClick" prop.`
            )
          }
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
          onNavigate
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

        prefetch(router, href, as, {
          locale,
          priority: true,
          // @see {https://github.com/vercel/next.js/discussions/40268?sort=top#discussioncomment-3572642}
          bypassPrefetchedCheck: true,
        })
      },
      onTouchStart: process.env.__NEXT_LINK_NO_TOUCH_START
        ? undefined
        : function onTouchStart(e) {
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

            if (!router) {
              return
            }

            prefetch(router, href, as, {
              locale,
              priority: true,
              // @see {https://github.com/vercel/next.js/discussions/40268?sort=top#discussioncomment-3572642}
              bypassPrefetchedCheck: true,
            })
          },
    }

    // If the url is absolute, we can bypass the logic to prepend the domain and locale.
    if (isAbsoluteUrl(as)) {
      childProps.href = as
    } else if (
      !legacyBehavior ||
      passHref ||
      (child.type === 'a' && !('href' in child.props))
    ) {
      const curLocale = typeof locale !== 'undefined' ? locale : router?.locale

      // we only render domain locales if we are currently on a domain locale
      // so that locale links are still visitable in development/preview envs
      const localeDomain =
        router?.isLocaleDomain &&
        getDomainLocale(as, curLocale, router?.locales, router?.domainLocales)

      childProps.href =
        localeDomain ||
        addBasePath(addLocale(as, curLocale, router?.defaultLocale))
    }

    if (legacyBehavior) {
      if (process.env.NODE_ENV === 'development') {
        errorOnce(
          '`legacyBehavior` is deprecated and will be removed in a future ' +
            'release. A codemod is available to upgrade your components:\n\n' +
            'npx @next/codemod@latest new-link .\n\n' +
            'Learn more: https://nextjs.org/docs/app/building-your-application/upgrading/codemods#remove-a-tags-from-link-components'
        )
      }
      return React.cloneElement(child, childProps)
    }

    return (
      <a {...restProps} {...childProps}>
        {children}
      </a>
    )
  }
)

const LinkStatusContext = createContext<{
  pending: boolean
}>({
  // We do not support link status in the Pages Router, so we always return false
  pending: false,
})

export const useLinkStatus = () => {
  // This behaviour is like React's useFormStatus. When the component is not under
  // a <form> tag, it will get the default value, instead of throwing an error.
  return useContext(LinkStatusContext)
}

export default Link
