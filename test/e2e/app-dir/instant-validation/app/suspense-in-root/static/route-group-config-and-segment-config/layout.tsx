import { ReactNode } from 'react'

export const unstable_instant = { level: 'experimental-error' }

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>This is a URL-contributing layout with unstable_instant (static)</em>
      <hr />
      {children}
    </div>
  )
}
