// Drops both {children} and {sidebar}. Both slots have configured
// pages, so both boundaries will be missing — the error should list
// both files.
import { ReactNode } from 'react'

export default function Layout({
  children,
  sidebar,
}: {
  children: ReactNode
  sidebar: ReactNode
}) {
  return <main>neither slot rendered</main>
}
