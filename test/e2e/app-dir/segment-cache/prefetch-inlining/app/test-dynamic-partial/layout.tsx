import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <p>Static parent</p>
      {children}
    </div>
  )
}
