import React from 'react'

export default function DashboardLayout(props: LayoutProps<'/dashboard'>) {
  return (
    <div>
      <h2>Dashboard Layout</h2>
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <h3>Main Content</h3>
          {props.children}
        </div>
        <div style={{ flex: 1 }}>
          <h3>Analytics</h3>
          {props.analytics}
        </div>
        <div style={{ flex: 1 }}>
          <h3>Team</h3>
          {props.team}
        </div>
      </div>
    </div>
  )
}
