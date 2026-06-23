import { connection } from 'next/server'
import { ReactNode } from 'react'

// Hole in the 3rd (deepest) group of @slot. Detected at groupDepth=2
// where g2 is the boundary and g3 is in the new tree.
export default async function G3Layout({ children }: { children: ReactNode }) {
  await connection()
  return <div>{children}</div>
}
