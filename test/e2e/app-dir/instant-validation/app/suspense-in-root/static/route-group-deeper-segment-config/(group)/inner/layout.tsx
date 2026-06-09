import { ReactNode } from 'react'

export const instant = { level: 'experimental-error' }

export default function InnerLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>This is a URL-contributing layout with instant (static)</em>
      <hr />
      {children}
    </div>
  )
}
