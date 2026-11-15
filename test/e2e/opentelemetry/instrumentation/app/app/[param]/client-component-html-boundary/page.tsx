import { Suspense } from 'react'
import AsyncClient from './async-client'
import InitiallyClosedPanel from './initially-closed-panel'

async function SlowDetails({ id }: { id: string }) {
  const response = await fetch(
    `http://localhost:${process.env.TEST_CLIENT_COMPONENT_GATE_PORT}/?key=${id}`,
    { cache: 'no-store' }
  )
  if (!response.ok) throw new Error('Details gate failed')
  return <AsyncClient />
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams
  if (!id) throw new Error('Missing details gate id')
  return (
    <InitiallyClosedPanel>
      <Suspense fallback={<span id="details-fallback">waiting</span>}>
        <SlowDetails id={id} />
      </Suspense>
    </InitiallyClosedPanel>
  )
}
