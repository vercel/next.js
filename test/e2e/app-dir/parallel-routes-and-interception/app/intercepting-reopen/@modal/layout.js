// Without this, the modal page is prerendered and `next start` serves the
// navigation from the prefetch cache instead of a dynamic request.
export const dynamic = 'force-dynamic'

export default function Layout({ children }) {
  return children
}
