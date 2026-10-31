import { connection } from 'next/server'
import { readData, readOuter } from './data'
import { notify } from '../../lib/notify'

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
  const direct = await readData(id)
  await notify(`outer:${id}`)
  const [first, second] = await Promise.all([
    readOuter(id, 'first'),
    readOuter(id, 'second'),
  ])

  return (
    <main>
      <p id="direct">{direct.value}</p>
      <p id={first.name}>{first.data.value}</p>
      <p id={second.name}>{second.data.value}</p>
    </main>
  )
}
