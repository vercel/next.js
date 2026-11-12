/// <reference path="./vitest-global.d.ts" />

// Type declarations for the globals installed by the Next-owned test runner.
// Enable these only alongside globals: true in a test-specific tsconfig.
declare global {
  let suite: (typeof import('vitest'))['suite']
  let test: (typeof import('vitest'))['test']
  let describe: (typeof import('vitest'))['describe']
  let it: (typeof import('vitest'))['it']
  let chai: (typeof import('vitest'))['chai']
  let expect: (typeof import('vitest'))['expect']
  let assert: (typeof import('vitest'))['assert']
  let expectTypeOf: (typeof import('vitest'))['expectTypeOf']
  let assertType: (typeof import('vitest'))['assertType']
  let vi: (typeof import('vitest'))['vi']
  let vitest: (typeof import('vitest'))['vitest']
  let beforeAll: (typeof import('vitest'))['beforeAll']
  let afterAll: (typeof import('vitest'))['afterAll']
  let beforeEach: (typeof import('vitest'))['beforeEach']
  let afterEach: (typeof import('vitest'))['afterEach']
  let onTestFailed: (typeof import('vitest'))['onTestFailed']
  let onTestFinished: (typeof import('vitest'))['onTestFinished']
  let aroundEach: (typeof import('vitest'))['aroundEach']
  let aroundAll: (typeof import('vitest'))['aroundAll']
}
export {}
