import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ one: string; two: string }>
}) {
  const { two } = await params

  if (two !== 'foo' && two !== 'bar') {
    notFound()
  }

  return (
    <div>
      <div id="two">{two}</div>
      {children}
    </div>
  )
}
