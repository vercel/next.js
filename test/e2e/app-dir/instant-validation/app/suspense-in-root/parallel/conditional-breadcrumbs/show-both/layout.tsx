import { ReactNode } from 'react'
export default function Layout({
  children,
  breadcrumbs,
}: {
  children: ReactNode
  breadcrumbs: ReactNode
}) {
  return (
    <main>
      <div>{breadcrumbs}</div>
      {children}
    </main>
  )
}
