import { ReactNode } from 'react'

export default function ProjectSettingsLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div data-project-settings-layout="domains-variant">
      <h2>Project Settings Layout (domains variant)</h2>
      {children}
    </div>
  )
}
