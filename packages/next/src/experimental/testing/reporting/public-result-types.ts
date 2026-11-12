import type { TestError } from '../primitives'

export type TestSuiteState = 'skipped' | 'pending' | 'failed' | 'passed'
export type TestModuleState = TestSuiteState | 'queued'
export type TestState = TestResult['state']

export interface TestResultPending {
  readonly state: 'pending'
  readonly errors: undefined
}

export interface TestResultPassed {
  readonly state: 'passed'
  readonly errors: ReadonlyArray<TestError> | undefined
}

export interface TestResultFailed {
  readonly state: 'failed'
  readonly errors: ReadonlyArray<TestError>
}

export interface TestResultSkipped {
  readonly state: 'skipped'
  readonly errors: undefined
  readonly note: string | undefined
}

export type TestResult =
  | TestResultPassed
  | TestResultFailed
  | TestResultSkipped
  | TestResultPending
