import type { ReactNode } from 'react'

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ top: string }>
}) {
  const { top } = await params

  return (
    <div>
      <div id="top">{top}</div>
      {children}
    </div>
  )
}
