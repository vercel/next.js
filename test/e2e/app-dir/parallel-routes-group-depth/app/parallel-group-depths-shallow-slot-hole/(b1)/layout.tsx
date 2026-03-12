import { ReactNode } from 'react'

export default function ChildrenGroupLayout({
  children,
}: {
  children: ReactNode
}) {
  return <div>{children}</div>
}
