import { formatUrl } from '../../shared/lib/router/utils/format-url'
import ClientNavLink, {
  type NavLinkProps,
  type LinkActiveState,
} from './nav-link'

// This wrapper runs on the server, so it receives the render-prop functions
// directly (before React tries to serialize them to the client). That lets us
// throw a `NavLink`-specific error instead of React's generic "Functions are
// not valid as a child of Client Components". When `NavLink` is used from a
// Client Component this wrapper does not run, so there is no false positive.
export default function NavLink(props: NavLinkProps) {
  if (
    typeof props.className === 'function' ||
    typeof props.children === 'function'
  ) {
    const href =
      typeof props.href === 'string' ? props.href : formatUrl(props.href)
    throw new Error(
      `NavLink "${href}": A function \`className\` or \`children\` only works in Client Components. Add the "use client" directive at the top of the file that renders it, or pass a string \`className\`/\`activeClassName\` instead.`
    )
  }

  return <ClientNavLink {...props} />
}

export { type NavLinkProps, type LinkActiveState }
