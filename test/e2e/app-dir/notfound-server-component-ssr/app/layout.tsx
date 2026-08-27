import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header id="root-layout-header">root layout</header>
        {children}
      </body>
    </html>
  )
}
