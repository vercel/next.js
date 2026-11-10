import { connection } from 'next/server'
import { readData, readOuter } from '../data'
import { notify } from '../../../lib/notify'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>
}) {
  await connection()
  const { id } = await searchParams
  if (id === undefined) {
    return null
  }
  if (typeof id !== 'string') {
    throw new Error('Expected a single id search parameter')
  }
  const pendingOuter = readOuter(id, 'outer')
  await notify(`direct-ready:${id}`)
  const direct = await readData(id)
  // This request records when the direct `readData()` call resolves.
  await notify(`direct-served:${id}`)
  const outer = await pendingOuter

  return (
    <main>
      <p id="direct">{direct.value}</p>
      <p id="outer">{outer.data.value}</p>
    </main>
  )
}
