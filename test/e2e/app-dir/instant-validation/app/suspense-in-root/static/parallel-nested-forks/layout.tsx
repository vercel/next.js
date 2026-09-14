import { ReactNode } from 'react'

export default function Layout({
  children,
  slot1,
}: {
  children: ReactNode
  slot1: ReactNode
}) {
  return (
    <div>
      <div style={{ border: '1px solid blue', padding: '1em' }}>{slot1}</div>
      {children}
    </div>
  )
}
