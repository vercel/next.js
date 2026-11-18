import type { ReactNode } from 'react'
import { Nav } from '../components/nav'

export default function Root({
  children,
  sidebar,
}: {
  children: ReactNode
  sidebar: ReactNode
}) {
  return (
    <html>
      <body>
        <Nav />
        <aside>{sidebar}</aside>
        <main>{children}</main>
      </body>
    </html>
  )
}
