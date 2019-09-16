import { record } from '../storage'

const EVENT_BUILD_DURATION = 'NEXT_BUILD_COMPLETED'
type EventBuildCompleted = {
  durationInSeconds: number
  totalPageCount: number
}

export function recordBuildDuration(event: EventBuildCompleted) {
  return record({
    eventName: EVENT_BUILD_DURATION,
    payload: event,
  })
}

const EVENT_BUILD_OPTIMIZE = 'NEXT_BUILD_OPTIMIZED'
type EventBuildOptimized = {
  durationInSeconds: number
  totalPageCount: number
  staticPageCount: number
  ssrPageCount: number
}

export function recordBuildOptimize(event: EventBuildOptimized) {
  return record({
    eventName: EVENT_BUILD_OPTIMIZE,
    payload: event,
  })
}
