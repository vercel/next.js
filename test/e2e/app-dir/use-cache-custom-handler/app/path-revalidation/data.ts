import { cacheLife, cacheTag } from 'next/cache'
import cacheSharingState from '../../cache-sharing-state'

export async function getData(id?: string) {
  'use cache: route-aware'

  cacheLife('hours')
  cacheTag('path-revalidation')

  if (id !== undefined) {
    cacheTag(`observed-fill:${id}`)
    cacheSharingState.fills.push(id)
    await cacheSharingState.pendingFill
  }

  return Math.random()
}
