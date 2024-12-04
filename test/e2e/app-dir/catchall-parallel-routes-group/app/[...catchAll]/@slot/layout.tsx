import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <h3 id="catch-all-slot-layout">Catch-all Slot Layout</h3>
      {children}
    </div>
  )
}
