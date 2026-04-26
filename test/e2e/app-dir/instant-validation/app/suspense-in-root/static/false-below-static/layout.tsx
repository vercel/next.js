import { ReactNode } from 'react'

// This layout requires instant UI with static prefetching.
// Even though the page below opts out with `false`, this layout's
// config still triggers validation at depths where both the layout
// and the page are in the new tree.
export const unstable_instant = true

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}
