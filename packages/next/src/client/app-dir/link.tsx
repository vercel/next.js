'use client'

import type { NextRouter } from '../../shared/lib/router/router'

import React from 'react'
import type { UrlObject } from 'url'
import { formatUrl } from '../../shared/lib/router/utils/format-url'
import { AppRouterContext } from '../../shared/lib/app-router-context.shared-runtime'
import type { AppRouterInstance } from '../../shared/lib/app-router-context.shared-runtime'
import { PrefetchKind } from '../components/router-reducer/router-reducer-types'
import { useMergedRef } from '../use-merged-ref'
import { isAbsoluteUrl } from '../../shared/lib/utils'
import { addBasePath } from '../add-base-path'
import { warnOnce } from '../../shared/lib/utils/warn-once'
import {
  mountLinkInstance,
  onNavigationIntent,
  unmountLinkInstance,
} from '../components/links'

type Url = string | UrlObject
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T]
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T]

type InternalLinkProps = {
  /**
   * **Required**. The path or URL to navigate to. It can also be an object (similar to `URL`).
   *
   * @example
   * ```tsx
   * // Navigate to /dashboard:
   * <Link href="/dashboard">Dashboard</Link>
   *
   * // Navigate to /about?name=test:
   * <Link href={{ pathname: '/about', query: { name: 'test' } }}>
   *   About
   * </Link>
   * ```
   *
   * @remarks
   * - For external URLs, use a fully qualified URL such as `https://...`.
   * - In the App Router, dynamic routes must not include bracketed segments in `href`.
   */
  href: Url

  /**
   * @deprecated v10.0.0: `href` props pointing to a dynamic route are
   * automatically resolved and no longer require the `as` prop.
   */
  as?: Url

  /**
   * Replace the current `history` state instead of adding a new URL into the stack.
   *
   * @defaultValue `false`
   *
   * @example
   * ```tsx
   * <Link href="/about" replace>
   *   About (replaces the history state)
   * </Link>
   * ```
   */
  replace?: boolean

  /**
   * Whether to override the default scroll behavior. If `true`, Next.js attempts to maintain
   * the scroll position if the newly navigated page is still visible. If not, it scrolls to the top.
   *
   * If `false`, Next.js will not modify the scroll behavior at all.
   *
   * @defaultValue `true`
   *
   * @example
   * ```tsx
   * <Link href="/dashboard" scroll={false}>
   *   No auto scroll
   * </Link>
   * ```
   */
  scroll?: boolean

  /**
   * Update the path of the current page without rerunning data fetching methods
   * like `getStaticProps`, `getServerSideProps`, or `getInitialProps`.
   *
   * @remarks
   * `shallow` only applies to the Pages Router. For the App Router, see the
   * [following documentation](https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#using-the-native-history-api).
   *
   * @defaultValue `false`
   *
   * @example
   * ```tsx
   * <Link href="/blog" shallow>
   *   Shallow navigation
   * </Link>
   * ```
   */
  shallow?: boolean

  /**
   * Forces `Link` to pass its `href` to the child component. Useful if the child is a custom
   * component that wraps an `<a>` tag, or if you're using certain styling libraries.
   *
   * @defaultValue `false`
   *
   * @example
   * ```tsx
   * <Link href="/dashboard" passHref>
   *   <MyStyledAnchor>Dashboard</MyStyledAnchor>
   * </Link>
   * ```
   */
  passHref?: boolean

  /**
   * Prefetch the page in the background.
   * Any `<Link />` that is in the viewport (initially or through scroll) will be prefetched.
   * Prefetch can be disabled by passing `prefetch={false}`.
   *
   * @remarks
   * Prefetching is only enabled in production.
   *
   * - In the **App Router**:
   *   - `null` (default): Prefetch behavior depends on static vs dynamic routes:
   *     - Static routes: fully prefetched
   *     - Dynamic routes: partial prefetch to the nearest segment with a `loading.js`
   *   - `true`: Always prefetch the full route and data.
   *   - `false`: Disable prefetching on both viewport and hover.
   * - In the **Pages Router**:
   *   - `true` (default): Prefetches the route and data in the background on viewport or hover.
   *   - `false`: Prefetch only on hover, not on viewport.
   *
   * @defaultValue `true` (Pages Router) or `null` (App Router)
   *
   * @example
   * ```tsx
   * <Link href="/dashboard" prefetch={false}>
   *   Dashboard
   * </Link>
   * ```
   */
  prefetch?: boolean | null

  /**
   * The active locale is automatically prepended in the Pages Router. `locale` allows for providing
   * a different locale, or can be set to `false` to opt out of automatic locale behavior.
   *
   * @remarks
   * Note: locale only applies in the Pages Router and is ignored in the App Router.
   *
   * @example
   * ```tsx
   * // Use the 'fr' locale:
   * <Link href="/about" locale="fr">
   *   About (French)
   * </Link>
   *
   * // Disable locale prefix:
   * <Link href="/about" locale={false}>
   *   About (no locale prefix)
   * </Link>
   * ```
   */
  locale?: string | false

  /**
   * Enable legacy link behavior, requiring an `<a>` tag to wrap the child content
   * if the child is a string or number.
   *
   * @defaultValue `false`
   * @see https://github.com/vercel/next.js/commit/489e65ed98544e69b0afd7e0cfc3f9f6c2b803b7
   */
  legacyBehavior?: boolean

  /**
   * Optional event handler for when the mouse pointer is moved onto the `<Link>`.
   */
  onMouseEnter?: React.MouseEventHandler<HTMLAnchorElement>

  /**
   * Optional event handler for when the `<Link>` is touched.
   */
  onTouchStart?: React.TouchEventHandler<HTMLAnchorElement>

  /**
   * Optional event handler for when the `<Link>` is clicked.
   */
  onClick?: React.MouseEventHandler<HTMLAnchorElement>

  /**
   * Optional function to wrap the navigation function to customize how navigation is executed.
   */
  withNavigateFn?: (navigateFn: () => void) => void
}

// TODO-APP: Include the full set of Anchor props
// adding this to the publicly exported type currently breaks existing apps

// `RouteInferType` is a stub here to avoid breaking `typedRoutes` when the type
// isn't generated yet. It will be replaced when the webpack plugin runs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type LinkProps<RouteInferType = any> = InternalLinkProps
type LinkPropsRequired = RequiredKeys<LinkProps>
type LinkPropsOptional = OptionalKeys<Omit<InternalLinkProps, 'locale'>>

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
  withNavigateFn: (navigateFn: () => void) => void,
  replace?: boolean,
  shallow?: boolean,
  scroll?: boolean
): void {
  const { nodeName } = e.currentTarget

  // anchors inside an svg have a lowercase nodeName
  const isAnchorNodeName = nodeName.toUpperCase() === 'A'

  if (isAnchorNodeName && isModifiedEvent(e)) {
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
        scroll: routerScroll,
      })
    } else {
      router[replace ? 'replace' : 'push'](as || href, {
        scroll: routerScroll,
      })
    }
  }

  withNavigateFn(() => React.startTransition(navigate))
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

const DEFAULT_WITH_NAVIGATE_FN = (navigateFn: () => void) => {
  navigateFn()
}

/**
 * A React component that extends the HTML `<a>` element to provide
 * [prefetching](https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#2-prefetching)
 * and client-side navigation. This is the primary way to navigate between routes in Next.js.
 *
 * @remarks
 * - Prefetching is only enabled in production.
 *
 * @see https://nextjs.org/docs/app/api-reference/components/link
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
      onClick,
      onMouseEnter: onMouseEnterProp,
      onTouchStart: onTouchStartProp,
      legacyBehavior = false,
      withNavigateFn = DEFAULT_WITH_NAVIGATE_FN,
      ...restProps
    } = props

    children = childrenProp

    if (
      legacyBehavior &&
      (typeof children === 'string' || typeof children === 'number')
    ) {
      children = <a>{children}</a>
    }

    const router = React.useContext(AppRouterContext)

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
        onClick: true,
        onMouseEnter: true,
        onTouchStart: true,
        legacyBehavior: true,
        withNavigateFn: true,
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
        } else if (
          key === 'onClick' ||
          key === 'onMouseEnter' ||
          key === 'onTouchStart' ||
          key === 'withNavigateFn'
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
          key === 'prefetch' ||
          key === 'legacyBehavior'
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
    }

    if (process.env.NODE_ENV !== 'production') {
      if (props.locale) {
        warnOnce(
          'The `locale` prop is not supported in `next/link` while using the `app` router. Read more about app router internalization: https://nextjs.org/docs/app/building-your-application/routing/internationalization'
        )
      }
      if (!asProp) {
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
    }

    const { href, as } = React.useMemo(() => {
      const resolvedHref = formatStringOrUrl(hrefProp)
      return {
        href: resolvedHref,
        as: asProp ? formatStringOrUrl(asProp) : resolvedHref,
      }
    }, [hrefProp, asProp])

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

    // Use a callback ref to attach an IntersectionObserver to the anchor tag on
    // mount. In the future we will also use this to keep track of all the
    // currently mounted <Link> instances, e.g. so we can re-prefetch them after
    // a revalidation or refresh.
    const observeLinkVisibilityOnMount = React.useCallback(
      (element: HTMLAnchorElement | SVGAElement) => {
        if (prefetchEnabled && router !== null) {
          mountLinkInstance(element, href, router, appPrefetchKind)
        }
        return () => {
          unmountLinkInstance(element)
        }
      },
      [prefetchEnabled, href, router, appPrefetchKind]
    )

    const mergedRef = useMergedRef(observeLinkVisibilityOnMount, childRef)

    const childProps: {
      onTouchStart?: React.TouchEventHandler<HTMLAnchorElement>
      onMouseEnter: React.MouseEventHandler<HTMLAnchorElement>
      onClick: React.MouseEventHandler<HTMLAnchorElement>
      href?: string
      ref?: any
    } = {
      ref: mergedRef,
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
          withNavigateFn,
          replace,
          shallow,
          scroll
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

        if (!prefetchEnabled || process.env.NODE_ENV === 'development') {
          return
        }

        onNavigationIntent(e.currentTarget as HTMLAnchorElement | SVGAElement)
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

            if (!prefetchEnabled) {
              return
            }

            onNavigationIntent(
              e.currentTarget as HTMLAnchorElement | SVGAElement
            )
          },
    }

    // If child is an <a> tag and doesn't have a href attribute, or if the 'passHref' property is
    // defined, we specify the current 'href', so that repetition is not needed by the user.
    // If the url is absolute, we can bypass the logic to prepend the basePath.
    if (isAbsoluteUrl(as)) {
      childProps.href = as
    } else if (
      !legacyBehavior ||
      passHref ||
      (child.type === 'a' && !('href' in child.props))
    ) {
      childProps.href = addBasePath(as)
    }

    return legacyBehavior ? (
      React.cloneElement(child, childProps)
    ) : (
      <a {...restProps} {...childProps}>
        {children}
      </a>
    )
  }
)

export default Link
