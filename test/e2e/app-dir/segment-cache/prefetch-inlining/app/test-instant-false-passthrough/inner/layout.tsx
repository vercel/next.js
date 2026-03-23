import { ReactNode } from 'react'

// Small static layout below the instant:false pass-through.
export default function InnerLayout({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}
