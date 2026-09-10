import type { ReactNode } from 'react'
import { RetainedActionsProvider } from './retained-actions'

export default function Layout({ children }: { children: ReactNode }) {
  return <RetainedActionsProvider>{children}</RetainedActionsProvider>
}
