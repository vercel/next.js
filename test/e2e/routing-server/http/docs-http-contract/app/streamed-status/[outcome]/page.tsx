import { Suspense } from 'react'
import { outcome } from '../../../lib/outcome'
import { waitForRelease } from '../../../lib/release'

async function Delayed({ name, id }: { name: string; id: string }) {
  await waitForRelease(id)
  return outcome(name)
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ outcome: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ outcome: name }, { id }] = await Promise.all([params, searchParams])
  if (typeof id !== 'string') throw new Error('Expected one release id')
  return (
    <Suspense fallback={<p id="pending-shell">Pending outcome</p>}>
      <Delayed name={name} id={id} />
    </Suspense>
  )
}
