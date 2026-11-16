import { randomUUID } from 'node:crypto'
import { cacheLife, cacheTag } from 'next/cache'
import sharedWriteFailureState from '../../shared-write-failure-state'

export async function readSharedValue(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(`shared-write-failure:${id}`)
  const value = randomUUID()
  sharedWriteFailureState.generatedValues.push(value)
  return value
}
