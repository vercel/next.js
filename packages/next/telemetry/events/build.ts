const EVENT_BUILD_DURATION = 'NEXT_BUILD_COMPLETED'
type EventBuildCompleted = {
  durationInSeconds: number
  totalPageCount: number
}

export function eventBuildDuration(
  event: EventBuildCompleted
): { eventName: string; payload: EventBuildCompleted } {
  return {
    eventName: EVENT_BUILD_DURATION,
    payload: event,
  }
}

const EVENT_BUILD_OPTIMIZE = 'NEXT_BUILD_OPTIMIZED'
type EventBuildOptimized = {
  durationInSeconds: number
  totalPageCount: number
  staticPageCount: number
  ssrPageCount: number
}

export function eventBuildOptimize(
  event: EventBuildOptimized
): { eventName: string; payload: EventBuildOptimized } {
  return {
    eventName: EVENT_BUILD_OPTIMIZE,
    payload: event,
  }
}
