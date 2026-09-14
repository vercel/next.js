import { ReactNode } from 'react'

export default function InnerLayout({
  children,
  panel,
}: {
  children: ReactNode
  panel: ReactNode
}) {
  return (
    <div>
      <div style={{ border: '1px solid green', padding: '0.5em' }}>{panel}</div>
      {children}
    </div>
  )
}
