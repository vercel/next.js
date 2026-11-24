import { Suspense } from 'react'
import { trace } from '@opentelemetry/api'

export const instant = false

export function generateStaticParams() {
  return [{ slug: 'built' }]
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const value = trace
    .getTracer('otel-span-end')
    .startActiveSpan('app-clock-guard', (span) => {
      try {
        return slug === 'built' ? 'built' : Date.now()
      } finally {
        span.end()
      }
    })
  return <p id="clock">{value}</p>
}

export default function Page(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p>Loading clock</p>}>
      <Content {...props} />
    </Suspense>
  )
}
