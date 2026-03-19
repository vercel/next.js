import { ReactNode } from 'react'

export const unstable_instant = { prefetch: 'static' }

export default function SlotLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>This is a layout inside the slot with unstable_instant (static)</em>
      <hr />
      {children}
    </div>
  )
}
