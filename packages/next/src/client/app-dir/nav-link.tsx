'use client'

import React from 'react'
import type { UrlObject } from 'url'
import { formatUrl } from '../../shared/lib/router/utils/format-url'
import { useUntrackedPathname } from '../components/navigation-untracked'
import LinkComponent, { type LinkProps } from './link'

/** State passed to a `NavLink` function `className`/`children`. */
export type LinkActiveState = {
  isActive: boolean
  isPending: boolean
}

export type NavLinkProps = Omit<
  LinkProps,
  'children' | 'className' | 'legacyBehavior' | 'passHref'
> & {
  /** Match nested paths by default; `exact` matches only `href`. `/` is always exact. */
  exact?: boolean
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

// Drop a trailing slash (except root) so matching is stable under `trailingSlash`.
function normalizePathname(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname
}

function matchNavLink(
  pathname: string,
  target: string,
  exact: boolean
): boolean {
  const currentPath = normalizePathname(pathname)
  const targetPath = normalizePathname(target)
  if (exact || targetPath === '/') {
    return currentPath === targetPath
  }
  return currentPath === targetPath || currentPath.startsWith(targetPath + '/')
}

/**
 * A `<Link>` that knows whether it points at the current route: it accepts
 * `className`/`children` as functions of `{ isActive, isPending }` and sets
 * `aria-current="page"` on the exact current page. The active state resolves on
 * the server without opting the link out of the static shell under `cacheComponents`.
 *
 * Matching ignores the query string and hash on `href`. `/` is active only on
 * `/` itself, and `exact` restricts any `href` to its own path.
 *
 * Two hooks reflect the state, because they mean different things. `data-active`
 * is present whenever the link is active (exact or prefix), for styling in CSS.
 * `aria-current="page"` is set only on an exact match, so an ancestor made active
 * by prefix matching still carries `data-active` but is not announced as the
 * current page.
 */
export default function NavLink(props: NavLinkProps) {
  const { href, exact = false, className, children, ref, ...rest } = props

  const pathname = useUntrackedPathname()
  const target = stripUrlQueryAndHash(formatStringOrUrl(href))
  const isActive = pathname !== null && matchNavLink(pathname, target, exact)
  // `aria-current="page"` marks the current page itself, so it's set only on an
  // exact match, not on an ancestor made active by prefix matching.
  const isCurrentPage =
    pathname !== null &&
    normalizePathname(pathname) === normalizePathname(target)

  // A string `className` passes through; a function is resolved inside `Link`,
  // where `isPending` lives.
  return (
    <LinkComponent
      {...rest}
      href={href}
      ref={ref ?? null}
      aria-current={isCurrentPage ? 'page' : undefined}
      data-active={isActive ? '' : undefined}
      className={className}
      __navActive={isActive}
    >
      {children}
    </LinkComponent>
  )
}
