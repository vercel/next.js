import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'

// The params are the only request-time data of this route. It's partially
// prerendered, but the params are still a hole in its static shell.
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  if (slug?.[0] === 'missing') {
    notFound()
  }
  return <section>{children}</section>
}
