import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ prefix: 'built' }]
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ prefix: string }>
}) {
  const { prefix } = await params
  return <section data-prefix={prefix}>{children}</section>
}
