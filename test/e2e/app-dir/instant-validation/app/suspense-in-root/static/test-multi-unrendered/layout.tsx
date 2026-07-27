// Drops both {children} and {sidebar}. Both slots have configured
// pages, but neither renders — both configs are vacuous and the route
// must validate cleanly.
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
