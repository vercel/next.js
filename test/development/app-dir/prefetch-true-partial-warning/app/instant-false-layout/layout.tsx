import { ReactNode } from 'react'

// `instant = false` lives on the layout, not the page. The
// SubtreeHasInstantFalse hint should propagate up from the layout to the root,
// so a `prefetch={true}` link to a page underneath it should NOT warn.
export const instant = false

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}
