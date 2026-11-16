import type { ReactNode } from 'react'

export function Note({ children }: { children: ReactNode }) {
  return <aside>{children}</aside>
}
