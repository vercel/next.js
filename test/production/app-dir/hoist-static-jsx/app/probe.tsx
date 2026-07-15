import type { ReactNode } from 'react'

let previousChildren: ReactNode = null

export function Probe({ children }: { children: ReactNode }) {
  const reused = previousChildren !== null && previousChildren === children
  previousChildren = children
  return (
    <div>
      <p id="reused">{String(reused)}</p>
      {children}
    </div>
  )
}
