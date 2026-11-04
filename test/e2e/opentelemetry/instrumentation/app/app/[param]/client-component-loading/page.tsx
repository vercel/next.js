import { Suspense } from 'react'
import EarlyClient from './early-client'
import ExtraLateClient from './extra-late-client'
import LateClient from './late-client'

async function GatedContent({ id, extra }: { id: string; extra: boolean }) {
  const response = await fetch(
    `http://localhost:${process.env.TEST_CLIENT_COMPONENT_GATE_PORT}/?key=${id}`,
    { cache: 'no-store' }
  )
  if (!response.ok) {
    throw new Error(`Gate request failed: ${response.status}`)
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
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id, variant } = await searchParams
  if (typeof id !== 'string') {
    throw new Error('Missing client component gate id')
  }
  if (variant !== undefined && variant !== 'extra') {
    throw new Error('Invalid client component loading variant')
  }
  const extra = variant === 'extra'

  return (
    <>
      <EarlyClient />
      <Suspense fallback={<span id="waiting">waiting</span>}>
        <GatedContent id={id} extra={extra} />
      </Suspense>
    </>
  )
}
