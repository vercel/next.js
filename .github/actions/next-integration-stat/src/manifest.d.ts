interface JobResult {
  job: string
  data: TestResult
}

interface TestResultManifest {
  nextjsVersion: string
  ref: string
  buildTime?: string
  buildSize?: string
  result: Array<JobResult>
  flakyMonitorJobResults: Array<JobResult>
}

/**
 * Models parsed test results output from next.js integration test.
 * This is a subset of the full test result output from jest, partially compatible.
 */
interface TestResult {
  numFailedTestSuites: number
  numFailedTests: number
  numPassedTestSuites: number
  numPassedTests: number
  numPendingTestSuites: number
  numPendingTests: number
  numRuntimeErrorTestSuites: number
  numTodoTests: number
  numTotalTestSuites: number
  numTotalTests: number
  startTime: number
  success: boolean
  testResults?: Array<{
    assertionResults?: Array<{
      ancestorTitles?: Array<string> | null
      failureMessages?: Array<string> | null
      fullName: string
      location?: null
      status: string
      title: string
    }> | null
    endTime: number
    message: string
    name: string
    startTime: number
    status: string
    summary: string
  }> | null
  wasInterrupted: boolean
}
