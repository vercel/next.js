import type { ReactNode } from 'react'

export default function MainLayout({
  children,
  desktopNav,
}: {
  children: ReactNode
  desktopNav: ReactNode
}) {
  return (
    <>
      <header style={{ position: 'sticky', top: 0, background: 'white' }}>
        {desktopNav}
      </header>
      {children}
    </>
  )
}
