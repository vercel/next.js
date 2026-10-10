import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header id="root-layout-header">ROOT LAYOUT HEADER</header>
        {children}
      </body>
    </html>
  )
}
