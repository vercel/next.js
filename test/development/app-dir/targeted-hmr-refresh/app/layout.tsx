import { ReactNode } from 'react'

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
        <p id="root-layout-marker">root-layout-initial</p>
        <main>{children}</main>
        <aside>{sidebar}</aside>
      </body>
    </html>
  )
}
