import { Suspense } from 'react'
import { connection } from 'next/server'
import { joinFill } from './actions'
import { JoinButton } from './join-button'

async function Content({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>
}) {
  await connection()
  const { id } = await searchParams
  if (typeof id !== 'string') {
    throw new Error('Expected a single id search parameter')
  }

  return (
    <>
      <p id="shared-write-render">{Math.random()}</p>
      <JoinButton joinFillAction={joinFill.bind(null, id)} />
    </>
  )
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>
}) {
  return (
    <Suspense fallback={<p>Loading action</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  )
}
