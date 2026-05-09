import { ReactNode } from 'react'

export default function TeamLayout({
  children,
  actions,
}: {
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <>
      <div>{children}</div>
      <div>{actions}</div>
    </>
  )
}
