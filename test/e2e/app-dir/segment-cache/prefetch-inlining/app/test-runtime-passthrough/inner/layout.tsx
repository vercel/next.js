import { ReactNode } from 'react'

// Small static layout below the runtime pass-through. The root should be able
// to inline through the runtime layout above and into this layout's child.
export default function InnerLayout({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}
