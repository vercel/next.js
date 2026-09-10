import type React from 'react'

export default function DashboardLayout(props: LayoutProps<'/dashboard'>) {
  const analytics: React.ReactNode = props.analytics
  const team: React.ReactNode = props.team
  // @ts-expect-error undeclared slot must error
  void props.nonExistentSlot

  return (
    <div>
      {props.children}
      {analytics}
      {team}
    </div>
  )
}
