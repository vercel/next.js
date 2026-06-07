import { sharedOwnerValue } from './shared-owner'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <section>
      <p id="dashboard-layout-marker">dashboard-layout-initial</p>
      <p id="layout-shared-owner-marker">{sharedOwnerValue}</p>
      {children}
    </section>
  )
}
