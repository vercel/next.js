import { trace } from '@opentelemetry/api'
import { Suspense } from 'react'
import EarlyClient from './early-client'
import ExtraEarlyClient from './extra-early-client'
import ExtraLateClient from './extra-late-client'
import LateClient from './late-client'

async function GatedContent({
  id,
  extra,
  noLate,
}: {
  id: string
  extra: boolean
  noLate: boolean
}) {
  const response = await fetch(
    `http://localhost:${process.env.TEST_CLIENT_COMPONENT_GATE_PORT}/?id=${id}`,
    { cache: 'no-store' }
  )
  if (!response.ok) {
    throw new Error(`Gate request failed: ${response.status}`)
  }

  trace
    .getTracer('client-component-loading-test')
    .startSpan('test.clientComponentGateReleased')
    .end()

  if (noLate) {
    return <span id="no-late-client">no late client</span>
  }

  return (
    <>
      <LateClient />
      {extra && <ExtraLateClient />}
    </>
  )
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id: string; variant?: string }>
}) {
  const { id, variant } = await searchParams
  const extra = variant === 'extra'
  const noLate = variant === 'no-late'

  return (
    <>
      <EarlyClient />
      {extra && <ExtraEarlyClient />}
      <Suspense fallback={<span id="waiting">waiting</span>}>
        <GatedContent id={id} extra={extra} noLate={noLate} />
      </Suspense>
    </>
  )
}
