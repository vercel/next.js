import { ReactNode } from 'react'
import { NoInline } from '../../components/no-inline'

// A static layout inflated past the inlining size threshold so it stays
// OUTLINED — it gets its own standalone static response instead of being
// bundled into the page's. Without it, this route's small intermediate
// segments would be bundled into the page's static response,
// and fetching THEM statically would deliver the page's content along for
// the ride — which would make the consuming test's "the page content must
// not arrive in any static response" rejection indistinguishable from a
// genuine static prefetch attempt of the page. Keeping the page's static
// response to itself preserves what that rejection pins: with the hint
// unset, the page segment is never statically prefetched.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <NoInline />
      {children}
    </div>
  )
}
