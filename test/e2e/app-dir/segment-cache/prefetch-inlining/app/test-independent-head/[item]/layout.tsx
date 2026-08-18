import { ReactNode } from 'react'

// This layout does NOT access the [item] param. Its rendered output is
// identical for /test-independent-head/a and /test-independent-head/b,
// so the segment cache can reuse it across both routes.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <p id="item-layout">Item layout</p>
      {children}
    </div>
  )
}
