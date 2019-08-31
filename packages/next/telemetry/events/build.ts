import { record } from '../storage'

const EVENT_BUILD_DURATION = 'NEXT_BUILD_DURATION'
type BuildDurationEventShape = {
  durationInSeconds: number
  numberOfPages: number
}

export function recordBuildDuration(event: BuildDurationEventShape) {
  return record({
    eventName: EVENT_BUILD_DURATION,
    payload: {
      seconds: event.durationInSeconds,
      pageCount: event.numberOfPages,
    },
  })
}

const EVENT_BUILD_OPTIMIZE = 'NEXT_BUILD_OPTIMIZE'
type BuildAnalysisEventShape = {
  durationInSeconds: number
  totalPageCount: number
  staticOptimizedPages: number
}

export function recordBuildOptimize(event: BuildAnalysisEventShape) {
  return record({
    eventName: EVENT_BUILD_OPTIMIZE,
    payload: {
      seconds: event.durationInSeconds,
      pageCount: event.totalPageCount,
      pageAutomaticPrerenderedCount: event.staticOptimizedPages,
    },
  })
}
