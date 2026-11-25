import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'
import { trace } from '@opentelemetry/api'

export const instant = false

export function generateStaticParams() {
  return [{ slug: 'built' }]
}

async function getData(slug: string) {
  'use cache'
  cacheTag(`otel-span-end:${slug}`)
  cacheLife('hours')
  return `${slug}: ${crypto.randomUUID()}`
}

async function RequestContent() {
  await connection()
  return <p id="request">Request-time content</p>
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const tracer = trace.getTracer('otel-span-end')
  if (slug === 'manual') {
    tracer.startSpan('otel-span-end-manual').end()
  } else if (slug === 'active') {
    tracer.startActiveSpan('otel-span-end-active', (span) => span.end())
  }

  return (
    <>
      <p id="cached">{await getData(slug)}</p>
      <Suspense fallback={<p>Loading request content</p>}>
        <RequestContent />
      </Suspense>
    </>
  )
}
