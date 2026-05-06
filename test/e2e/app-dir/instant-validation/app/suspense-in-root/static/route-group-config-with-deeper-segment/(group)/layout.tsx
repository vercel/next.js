import { ReactNode } from 'react'

export const unstable_instant = { level: 'experimental-error' }

export default function GroupLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>This is a route group layout with unstable_instant (static)</em>
      <hr />
      {children}
    </div>
  )
}
