import { ReactNode } from 'react'
export default function Layout({
  breadcrumbs,
}: {
  children: ReactNode
  breadcrumbs: ReactNode
}) {
  return <main>{breadcrumbs}</main>
}
