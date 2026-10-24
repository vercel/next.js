import type { ReactNode } from 'react'
import { sharedLayoutValue } from '../shared-layout-module'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <p id="dashboard-layout">{sharedLayoutValue('dashboard')}</p>
      {children}
    </section>
  )
}
