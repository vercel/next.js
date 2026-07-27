import { ReactNode } from 'react'
export default function ParallelLayout({
  children,
  sidebar,
}: {
  children: ReactNode
  sidebar: ReactNode
}) {
  return (
    <div>
      <main>{children}</main>
      <aside>{sidebar}</aside>
    </div>
  )
}
