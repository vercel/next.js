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
  hasDunderPages: boolean
  hasTestPages: boolean
}

const REGEXP_DIRECTORY_DUNDER = /[\\/]__[^\\/]+(?<!tests|mocks)__[\\/]/
const REGEXP_DIRECTORY_TESTS = /[\\/]__(tests|mocks)__[\\/]/

const TEST_FILE = /\.(spec|test)\.[jt]sx?$/

export function eventBuildOptimize(
  pagePaths: string[],
  event: Omit<
    EventBuildOptimized,
    'totalPageCount' | 'hasDunderPages' | 'hasTestPages'
  >
): { eventName: string; payload: EventBuildOptimized } {
  return {
    eventName: EVENT_BUILD_OPTIMIZE,
    payload: {
      ...event,
      totalPageCount: pagePaths.length,
      hasDunderPages: pagePaths.some(path =>
        REGEXP_DIRECTORY_DUNDER.test(path)
      ),
      hasTestPages: pagePaths.some(
        path => REGEXP_DIRECTORY_TESTS.test(path) || TEST_FILE.test(path)
      ),
    },
  }
}
