import type { ReactNode } from 'react'

export default function RootLayout({
  children,
  breadcrumbs,
}: {
  children: ReactNode
  breadcrumbs: ReactNode
  params: Promise<{ locale: string }>
}) {
  return (
    <>
      <div id="breadcrumbs">{breadcrumbs}</div>
      <main id="main">{children}</main>
    </>
  )
}
