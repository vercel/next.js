import { ReactNode } from 'react'

export const instant = { level: 'experimental-error' }

export default function SlotLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <em>This is a layout inside the slot with instant (static)</em>
      <hr />
      {children}
    </div>
  )
}
