import type { TestOptions } from './collector'
import type { Task, TaskResult, TestAnnotation, TestArtifact } from './tasks'

/** Public common task fields; file/attempt state belongs to populated tasks. */
export interface RunnerTaskBase
  extends Pick<
    Task,
    | 'id'
    | 'name'
    | 'fullName'
    | 'fullTestName'
    | 'mode'
    | 'meta'
    | 'concurrent'
    | 'shuffle'
    | 'suite'
    | 'location'
  > {
  each?: boolean
  result?: RunnerTaskResult
  retry?: Exclude<TestOptions['retry'], undefined>
  repeats?: number
  dynamic?: boolean
  tags?: string[]
  logs?: {
    content: string
    origin?: string
    browser?: boolean
    type: 'stdout' | 'stderr'
    taskId?: string
    time: number
    size: number
  }[]
}

/** Public result data excludes the runner's private interruption bookkeeping. */
export interface RunnerTaskResult
  extends Omit<TaskResult, 'pending' | 'note' | 'hooks'> {
  heap?: number
  hooks?: Partial<
    Record<
      | 'beforeAll'
      | 'afterAll'
      | 'aroundAll'
      | 'beforeEach'
      | 'afterEach'
      | 'aroundEach',
      TaskResult['state']
    >
  >
}

export type RunnerTaskResultPack = [
  id: string,
  result: RunnerTaskResult | undefined,
  meta: Task['meta'],
]

export type RunnerTaskEventPack = [
  id: string,
  event:
    | 'test-failed-early'
    | 'suite-failed-early'
    | 'test-prepare'
    | 'test-finished'
    | 'test-retried'
    | 'test-cancel'
    | 'suite-prepare'
    | 'suite-finished'
    | 'before-hook-start'
    | 'before-hook-end'
    | 'after-hook-start'
    | 'after-hook-end'
    | 'test-annotation'
    | 'test-artifact',
  data:
    | {
        annotation?: TestAnnotation | undefined
        artifact?: TestArtifact | undefined
      }
    | undefined,
]
