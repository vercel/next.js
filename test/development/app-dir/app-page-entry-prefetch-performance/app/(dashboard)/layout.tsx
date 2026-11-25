import type { ReactNode } from 'react'
import { DashboardNav } from './dashboard-nav'

// Match the source application, which opts out of instant navigation at its
// root while it migrates to Cache Components.
export const instant = false

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardNav />
      <main>{children}</main>
    </>
  )
}
