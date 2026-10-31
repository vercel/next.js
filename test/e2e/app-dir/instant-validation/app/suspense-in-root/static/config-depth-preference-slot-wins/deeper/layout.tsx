import { ReactNode } from 'react'

export default function DeeperLayout({
  children,
  anotherSlot,
}: {
  children: ReactNode
  anotherSlot: ReactNode
}) {
  return (
    <div>
      <div style={{ border: '1px solid green', padding: '0.5em' }}>
        {anotherSlot}
      </div>
      {children}
    </div>
  )
}
