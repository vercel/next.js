import { ReactNode } from 'react'

export default function GroupLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>This is a route group layout with no config</em>
      <hr />
      {children}
    </div>
  )
}
