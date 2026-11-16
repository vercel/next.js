import { connection } from 'next/server'
import { getData } from '../data'
import cacheSharingState from '../../../cache-sharing-state'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  await connection()
  const { id } = await searchParams

  const pendingData = id === undefined ? getData() : getData(id)
  cacheSharingState.startedRoutes.push(id === undefined ? 'a' : `a:${id}`)

  return <p id="data">{await pendingData}</p>
}
