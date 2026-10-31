import { cookies } from 'next/headers'
import { ReactNode } from 'react'

// Hole in the 1st (shallowest) group of @slot. Not detected before
// the children slot's b2 hole because at groupDepth=1, g1 is the
// boundary (shared) and b1 is the boundary with b2 new.
export default async function G1Layout({ children }: { children: ReactNode }) {
  await cookies()
  return <div>{children}</div>
}
