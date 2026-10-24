'use server'

import { refresh } from 'next/cache'
import { readSharedValue } from './data'
import sharedWriteFailureState from '../../shared-write-failure-state'

export async function joinFill(id: string) {
  const pendingValue = readSharedValue(id)
  sharedWriteFailureState.joinerStarted = true
  const value = await pendingValue
  sharedWriteFailureState.joinerReadCompleted = true
  refresh()
  return value
}
