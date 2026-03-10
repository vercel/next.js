import { ReactNode } from 'react'

export const unstable_instant = { prefetch: 'static' }

export default function GroupLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>
        This is a route group layout that also has unstable_instant (static)
      </em>
      <hr />
      {children}
    </div>
  )
}
