import { ReactNode } from 'react'
export default function Layout({
  children,
}: {
  children: ReactNode
  breadcrumbs: ReactNode
}) {
  return <main>{children}</main>
}
