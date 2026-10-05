import type { ReactNode } from 'react'

export default async function TopLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ top: string }>
}) {
  const { top } = await params
  return <section data-top={top}>{children}</section>
}
