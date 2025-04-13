export const TEST_CONTEXT_SYMBOL = Symbol.for(
  '@next/jest-environment/TestContext'
)

export type TestContext = {
  nameStack: string[]
  status: 'before' | 'running' | 'success' | 'failure'
}

export type TestSuiteContext = {
  rootDir: string
  testPathRelativeToRepo: string
  testPathRelativeToTestDir: string
  suiteStartTime: number
  currentTest: TestContext | null
}

export function formatTestName(nameStack: string[]) {
  return nameStack.join(' › ')
}
