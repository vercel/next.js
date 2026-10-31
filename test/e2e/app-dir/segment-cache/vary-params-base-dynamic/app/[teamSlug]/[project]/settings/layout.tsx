import { ReactNode } from 'react'

export default function ProjectSettingsLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div data-project-settings-layout="default">
      <h2>Project Settings Layout</h2>
      {children}
    </div>
  )
}
