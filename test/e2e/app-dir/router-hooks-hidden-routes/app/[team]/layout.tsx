import type { ReactNode } from 'react'
import { Probe, SegmentHooksProbe } from '../../components/probe'

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
  const segmentParams = await params
  return (
    <section>
      <Probe label="team-layout" segmentParams={segmentParams} />
      <SegmentHooksProbe label="team-layout" segmentParams={segmentParams} />
      {children}
    </section>
  )
}
