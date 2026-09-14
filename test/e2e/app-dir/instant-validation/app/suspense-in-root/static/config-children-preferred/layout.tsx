import { ReactNode } from 'react'

export default function Layout({
  children,
  slot,
  other,
}: {
  children: ReactNode
  slot: ReactNode
  other: ReactNode
}) {
  return (
    <div>
      <div style={{ border: '1px solid blue', padding: '1em' }}>{slot}</div>
      <div style={{ border: '1px solid green', padding: '1em' }}>{other}</div>
      {children}
    </div>
  )
}
