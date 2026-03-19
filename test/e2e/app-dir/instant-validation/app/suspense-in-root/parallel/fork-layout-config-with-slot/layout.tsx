import { ReactNode } from 'react'

export const unstable_instant = { prefetch: 'static' }

export default function Layout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <>
      <div style={{ border: '1px solid blue', padding: '1em' }}>{slot}</div>
      {children}
    </>
  )
}
