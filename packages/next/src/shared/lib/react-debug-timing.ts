export type ReactTimingRecord = {
  id: string
  kind: 'component' | 'await'
  name: string
  environment: string
  outcome?: 'completed' | 'errored' | 'aborted'
  ownerName?: string
  componentPath?: string
  source?: {
    file: string
    methodName: string
    line: number
    column: number
  }
  startTime: number
  durationMs: number
}
