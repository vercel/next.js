import type React from 'react'
import type { LinkProps } from './link'

/** The active state passed to a `NavLink` function `className`/`children`. */
export type LinkActiveState = {
  isActive: boolean
  isPending: boolean
}

export type NavLinkProps = Omit<LinkProps, 'children' | 'className'> & {
  exact?: boolean
  activeClassName?: string
  className?: string | ((state: LinkActiveState) => string)
  children?: React.ReactNode | ((state: LinkActiveState) => React.ReactNode)
  ref?: React.Ref<HTMLAnchorElement>
}

/**
 * `NavLink` is only available in the App Router. This Pages Router entry exists
 * so the `next/nav-link` type surface resolves; calling it throws.
 */
export default function NavLink(_props: NavLinkProps): React.JSX.Element {
  throw new Error(
    '`next/nav-link` is only supported in the App Router (the `app` directory).'
  )
}
