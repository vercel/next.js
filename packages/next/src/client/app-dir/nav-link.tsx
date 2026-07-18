'use client'

import React from 'react'
import type { UrlObject } from 'url'
import { formatUrl } from '../../shared/lib/router/utils/format-url'
import { useUntrackedPathname } from '../components/navigation-untracked'
import LinkComponent, { type LinkProps } from './link'

/** The active state passed to a `NavLink` function `className`/`children`. */
export type LinkActiveState = {
  /** Whether the link's `href` matches the current pathname. */
  isActive: boolean
  /** Whether a navigation to this link is in progress. */
  isPending: boolean
}

export type NavLinkProps = Omit<LinkProps, 'children' | 'className'> & {
  /**
   * How `href` is compared to the current pathname:
   * - Default: active on `href` and any nested path (`/blog` matches
   *   `/blog/post`). `/` stays exact so it is not active everywhere.
   * - `exact`: active only when the pathname equals `href`.
   */
  exact?: boolean
  /** Class appended when active. Convenience for the common string case. */
  activeClassName?: string
  className?: string | ((state: LinkActiveState) => string)
  children?: React.ReactNode | ((state: LinkActiveState) => React.ReactNode)
  ref?: React.Ref<HTMLAnchorElement>
}

function formatStringOrUrl(urlObjOrString: UrlObject | string): string {
  return typeof urlObjOrString === 'string'
    ? urlObjOrString
    : formatUrl(urlObjOrString)
}

function stripUrlQueryAndHash(url: string): string {
  const index = url.search(/[?#]/)
  return index === -1 ? url : url.slice(0, index)
}

function matchNavLink(
  pathname: string,
  target: string,
  exact: boolean
): boolean {
  if (exact || target === '/') {
    return pathname === target
  }
  return pathname === target || pathname.startsWith(target + '/')
}

/**
 * A `<Link>` that knows whether it points at the current route. It sets
 * `aria-current="page"` when active and lets `className` and `children` be
 * functions of `{ isActive, isPending }`, so a nav item can style or swap its
 * content without wiring up `usePathname()` by hand.
 *
 * ```tsx
 * import NavLink from 'next/nav-link'
 *
 * <NavLink href="/dashboard" activeClassName="font-bold">
 *   Dashboard
 * </NavLink>
 *
 * <NavLink
 *   href="/inbox"
 *   className={({ isActive, isPending }) =>
 *     cn(isActive && 'text-blue-600', isPending && 'opacity-50')}
 * >
 *   {({ isActive }) => (isActive ? <InboxFilled /> : <Inbox />)}
 * </NavLink>
 * ```
 *
 * The active state is computed from the current pathname without opting the
 * link out of the static shell under `cacheComponents`, and it is resolved on
 * the server too, so the correct state is present on first paint.
 */
export default function NavLink(props: NavLinkProps) {
  const {
    href,
    exact = false,
    activeClassName,
    className,
    children,
    ref,
    ...rest
  } = props

  const pathname = useUntrackedPathname()
  const target = stripUrlQueryAndHash(formatStringOrUrl(href))
  const isActive = pathname !== null && matchNavLink(pathname, target, exact)

  // `activeClassName` needs only `isActive`, so fold it into a string here. A
  // function `className` is passed through and resolved inside `Link`, where
  // the pending status lives.
  const resolvedClassName =
    typeof className === 'function'
      ? className
      : [className, isActive && activeClassName ? activeClassName : null]
          .filter(Boolean)
          .join(' ') || undefined

  return (
    <LinkComponent
      {...rest}
      href={href}
      ref={ref ?? null}
      aria-current={isActive ? 'page' : undefined}
      className={resolvedClassName}
      __navActive={isActive}
    >
      {children}
    </LinkComponent>
  )
}
