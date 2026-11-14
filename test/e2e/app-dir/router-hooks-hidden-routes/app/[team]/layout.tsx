import type { ReactNode } from 'react'
import { Probe } from '../../components/probe'

export function generateStaticParams() {
  return [{ team: 'acme' }]
}

export default async function TeamLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ team: string }>
}) {
  return (
    <section>
      <Probe label="team-layout" segmentParams={await params} />
      {children}
    </section>
  )
}
