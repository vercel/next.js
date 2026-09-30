import { ReactNode } from 'react'

// Can't set this in client modules, so we do it in a parent layout instead
export const unstable_ensureStatic = 'navigation'

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
