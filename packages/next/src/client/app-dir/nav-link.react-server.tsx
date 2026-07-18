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
    throw new Error(
      'A `NavLink` with a function `className` or `children` (render props) must be rendered from a Client Component, because the function cannot be passed to a Client Component from the server. Add the "use client" directive to the file that renders this `NavLink`, or pass a string `className`/`activeClassName` instead.'
    )
  }

  return <ClientNavLink {...props} />
}

export { type NavLinkProps, type LinkActiveState }
