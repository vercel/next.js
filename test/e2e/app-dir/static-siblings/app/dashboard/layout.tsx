import { ReactNode } from 'react'

export default function DashboardLayout({
  children,
  panel,
}: {
  children: ReactNode
  panel: ReactNode
}) {
  return (
    <div>
      <div id="children">{children}</div>
      <div id="panel">{panel}</div>
    </div>
  )
}
