'use client'

import React, { createContext, useContext, useOptimistic, useRef } from 'react'
import type { UrlObject } from 'url'
import { formatUrl } from '../../shared/lib/router/utils/format-url'
import { AppRouterContext } from '../../shared/lib/app-router-context.shared-runtime'
import { useMergedRef } from '../use-merged-ref'
import { isAbsoluteUrl } from '../../shared/lib/utils'
import { addBasePath } from '../add-base-path'
import { warnOnce } from '../../shared/lib/utils/warn-once'
import type { PENDING_LINK_STATUS } from '../components/links'
import {
  IDLE_LINK_STATUS,
  mountLinkInstance,
  onNavigationIntent,
  unmountLinkForCurrentNavigation,
  unmountPrefetchableInstance,
  type LinkInstance,
} from '../components/links'
import { isLocalURL } from '../../shared/lib/router/utils/is-local-url'
import {
  FetchStrategy,
  type PrefetchTaskFetchStrategy,
} from '../components/segment-cache'
import { errorOnce } from '../../shared/lib/utils/error-once'

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
   * <Link href="/dashboard" passHref legacyBehavior>
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
   *   - `"auto"`, `null`, `undefined` (default): Prefetch behavior depends on static vs dynamic routes:
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
  prefetch?: boolean | 'auto' | null | 'unstable_forceStale'

  /**
   * (unstable) Switch to a full prefetch on hover. Effectively the same as
   * updating the prefetch prop to `true` in a mouse event.
   */
  unstable_dynamicOnHover?: boolean

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
   * Enable legacy link behavior.
   *
   * @deprecated This will be removed in a future version
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
   * Optional event handler for when the `<Link>` is navigated.
   */
  onNavigate?: OnNavigateEventHandler
}

// TODO-APP: Include the full set of Anchor props
// adding this to the publicly exported type currently breaks existing apps

// `RouteInferType` is a stub here to avoid breaking `typedRoutes` when the type
// isn't generated yet. It will be replaced when type generation runs.
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
  href: string,
  as: string,
  linkInstanceRef: React.RefObject<LinkInstance | null>,
  replace?: boolean,
  scroll?: boolean,
  onNavigate?: OnNavigateEventHandler
): void {
  if (typeof window !== 'undefined') {
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

    const { dispatchNavigateAction } =
      require('../components/app-router-instance') as typeof import('../components/app-router-instance')

    React.startTransition(() => {
      dispatchNavigateAction(
        as || href,
        replace ? 'replace' : 'push',
        scroll ?? true,
        linkInstanceRef.current
      )
    })
  }
}

function formatStringOrUrl(urlObjOrString: UrlObject | string): string {
  if (typeof urlObjOrString === 'string') {
    return urlObjOrString
  }

  return formatUrl(urlObjOrString)
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
export default function LinkComponent(
  props: LinkProps & {
    children: React.ReactNode
    ref: React.Ref<HTMLAnchorElement>
  }
) {
  const [linkStatus, setOptimisticLinkStatus] = useOptimistic(IDLE_LINK_STATUS)

  let children: React.ReactNode

  const linkInstanceRef = useRef<LinkInstance | null>(null)

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
    onNavigate,
    ref: forwardedRef,
    unstable_dynamicOnHover,
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

  const fetchStrategy =
    prefetchProp !== false
      ? getFetchStrategyFromPrefetchProp(prefetchProp)
      : // TODO: it makes no sense to assign a fetchStrategy when prefetching is disabled.
        FetchStrategy.PPR

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
      unstable_dynamicOnHover: true,
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
        key === 'legacyBehavior' ||
        key === 'unstable_dynamicOnHover'
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
          props[key] !== 'auto' &&
          props[key] !== 'unstable_forceStale'
        ) {
          throw createPropError({
            key,
            expected: '`boolean | "auto" | "unstable_forceStale"`',
            actual: valType,
          })
        }
      } else {
        // TypeScript trick for type-guarding:
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
    if ((children as any)?.$$typeof === Symbol.for('react.lazy')) {
      throw new Error(
        `\`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag.`
      )
    }

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
      if (router !== null) {
        linkInstanceRef.current = mountLinkInstance(
          element,
          href,
          router,
          fetchStrategy,
          prefetchEnabled,
          setOptimisticLinkStatus
        )
      }

      return () => {
        if (linkInstanceRef.current) {
          unmountLinkForCurrentNavigation(linkInstanceRef.current)
          linkInstanceRef.current = null
        }
        unmountPrefetchableInstance(element)
      }
    },
    [prefetchEnabled, href, router, fetchStrategy, setOptimisticLinkStatus]
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
      linkClicked(e, href, as, linkInstanceRef, replace, scroll, onNavigate)
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

      const upgradeToDynamicPrefetch = unstable_dynamicOnHover === true
      onNavigationIntent(
        e.currentTarget as HTMLAnchorElement | SVGAElement,
        upgradeToDynamicPrefetch
      )
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

          const upgradeToDynamicPrefetch = unstable_dynamicOnHover === true
          onNavigationIntent(
            e.currentTarget as HTMLAnchorElement | SVGAElement,
            upgradeToDynamicPrefetch
          )
        },
  }

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

  let link: React.ReactNode

  if (legacyBehavior) {
    if (process.env.NODE_ENV === 'development') {
      errorOnce(
        '`legacyBehavior` is deprecated and will be removed in a future ' +
          'release. A codemod is available to upgrade your components:\n\n' +
          'npx @next/codemod@latest new-link .\n\n' +
          'Learn more: https://nextjs.org/docs/app/building-your-application/upgrading/codemods#remove-a-tags-from-link-components'
      )
    }
    link = React.cloneElement(child, childProps)
  } else {
    link = (
      <a {...restProps} {...childProps}>
        {children}
      </a>
    )
  }

  return (
    <LinkStatusContext.Provider value={linkStatus}>
      {link}
    </LinkStatusContext.Provider>
  )
}

const LinkStatusContext = createContext<
  typeof PENDING_LINK_STATUS | typeof IDLE_LINK_STATUS
>(IDLE_LINK_STATUS)

export const useLinkStatus = () => {
  return useContext(LinkStatusContext)
}

function getFetchStrategyFromPrefetchProp(
  prefetchProp: Exclude<LinkProps['prefetch'], undefined | false>
): PrefetchTaskFetchStrategy {
  if (
    process.env.__NEXT_CACHE_COMPONENTS &&
    process.env.__NEXT_CLIENT_SEGMENT_CACHE
  ) {
    // In the new implementation:
    // - `prefetch={true}` is a runtime prefetch
    //   (includes cached IO + params + cookies, with dynamic holes for uncached IO).
    // - `unstable_forceStale` is a "full" prefetch
    //   (forces inclusion of all dynamic data, i.e. the old behavior of `prefetch={true}`)
    if (prefetchProp === true) {
      return FetchStrategy.PPRRuntime
    }
    if (prefetchProp === 'unstable_forceStale') {
      return FetchStrategy.Full
    }

    // `null` or `"auto"`: this is the default "auto" mode, where we will prefetch partially if the link is in the viewport.
    // This will also include invalid prop values that don't match the types specified here.
    // (although those should've been filtered out by prop validation in dev)
    prefetchProp satisfies null | 'auto'
    // In `clientSegmentCache`, we default to PPR, and we'll discover whether or not the route supports it with the initial prefetch.
    // If we're not using `clientSegmentCache`, this will be converted into a `PrefetchKind.AUTO`.
    return FetchStrategy.PPR
  } else {
    return prefetchProp === null || prefetchProp === 'auto'
      ? // In `clientSegmentCache`, we default to PPR, and we'll discover whether or not the route supports it with the initial prefetch.
        // If we're not using `clientSegmentCache`, this will be converted into a `PrefetchKind.AUTO`.
        FetchStrategy.PPR
      : // In the old implementation without runtime prefetches, `prefetch={true}` forces all dynamic data to be prefetched.
        // To preserve backwards-compatibility, anything other than `false`, `null`, or `"auto"` results in a full prefetch.
        // (although invalid values should've been filtered out by prop validation in dev)
        FetchStrategy.Full
  }
}
