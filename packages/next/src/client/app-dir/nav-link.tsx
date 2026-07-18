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

export type NavLinkProps = Omit<LinkProps, 'children' | 'className'> & {
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
 * A `<Link>` that knows whether it points at the current route: it sets
 * `aria-current="page"` when active and accepts `className`/`children` as
 * functions of `{ isActive, isPending }`. The active state resolves on the
 * server without opting the link out of the static shell under `cacheComponents`.
 */
export default function NavLink(props: NavLinkProps) {
  const { href, exact = false, className, children, ref, ...rest } = props

  const pathname = useUntrackedPathname()
  const target = stripUrlQueryAndHash(formatStringOrUrl(href))
  const isActive = pathname !== null && matchNavLink(pathname, target, exact)

  // A string `className` passes through; a function is resolved inside `Link`,
  // where `isPending` lives.
  return (
    <LinkComponent
      {...rest}
      href={href}
      ref={ref ?? null}
      aria-current={isActive ? 'page' : undefined}
      className={className}
      __navActive={isActive}
    >
      {children}
    </LinkComponent>
  )
}
