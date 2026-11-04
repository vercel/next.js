import type { ReactNode } from 'react'
import NavigationReset from './navigation-reset'
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavigationReset />
        {children}
      </body>
    </html>
  )
}
