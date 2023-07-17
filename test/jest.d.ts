/// <reference types="jest" />
/// <reference types="jest-extended" />

declare namespace jest {
  // https://github.com/jestjs/jest/blob/6460335f88cee3dcb9d29c49d55ab02b9d83f994/packages/expect/src/types.ts#L58-L72
  interface MatcherState {
    assertionCalls: number
    currentTestName?: string
    error?: Error
    expand?: boolean
    expectedAssertionsNumber: number | null
    expectedAssertionsNumberError?: Error
    isExpectingAssertions: boolean
    isExpectingAssertionsError?: Error
    isNot?: boolean
    numPassingAsserts: number
    promise?: string
    suppressedErrors: Array<Error>
    testPath?: string
  }

  interface Expect {
    // https://github.com/jestjs/jest/blob/6460335f88cee3dcb9d29c49d55ab02b9d83f994/packages/expect/src/index.ts#L461
    // https://github.com/jestjs/jest/blob/6460335f88cee3dcb9d29c49d55ab02b9d83f994/packages/expect/src/jestMatchersObject.ts#L44-L45
    getState(): MatcherState
  }
}
