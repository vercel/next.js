/// <reference lib="es2021.promise" />
import type { Test } from '../runner/tasks'
import type {
  chai,
  Assertion as PrimitiveAssertion,
  AsymmetricMatchersContaining as PrimitiveAsymmetricMatchersContaining,
  ExpectStatic as PrimitiveExpectStatic,
  addSerializer,
  addCustomEqualityTesters,
} from '../../../compiled/next-test-primitives'

export type {
  Mock,
  MockInstance,
  Tester,
  TesterContext,
} from '../../../compiled/next-test-primitives'

export type {
  MatcherState,
  MatchersObject,
} from '../../../compiled/next-test-primitives'

/** C owns this identity and the active-context accessor. */
export interface AssertionAttempt {
  id: string
  testId: string
  name: string
  signal?: AbortSignal
  readonly task?: Test
  onAssertionFailure?(error: unknown): void
}

export interface AssertionCollection {
  id: string
  name: string
}

export interface AssertionHook {
  id: string
  name: string
  hook: 'beforeAll' | 'afterAll' | 'aroundAll' | 'cleanup'
}

// Declaration merging supplies user-defined matcher methods through the facade.
export interface Matchers<
  R extends void | Promise<void> = void | Promise<void>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  T = unknown,
> {
  toHaveBeenExhausted(): R
}

export interface Assertion<R extends void | Promise<void> = void, T = unknown>
  extends PrimitiveAssertion<R, T>,
    Matchers<R, T> {
  not: Assertion<R, T>
  resolves: Assertion<Promise<void>, Awaited<T>>
  rejects: Assertion<Promise<void>, unknown>
  toMatchSnapshot(propertiesOrMessage?: object | string, message?: string): R
  toMatchInlineSnapshot(
    propertiesOrSnapshot?: object | string,
    snapshotOrMessage?: string,
    message?: string
  ): R
  toMatchFileSnapshot(filepath: string, message?: string): Promise<void>
  toThrowErrorMatchingSnapshot(
    propertiesOrMessage?: object | string,
    message?: string
  ): R
  toThrowErrorMatchingInlineSnapshot(snapshot?: string, message?: string): R
}

export interface AsymmetricMatchersContaining
  extends PrimitiveAsymmetricMatchersContaining {}

export interface TestAssertion<T = unknown> extends Assertion<void, T> {
  toMatchSnapshot(propertiesOrMessage?: object | string, message?: string): void
  toMatchInlineSnapshot(
    propertiesOrSnapshot?: object | string,
    snapshotOrMessage?: string,
    message?: string
  ): void
  toMatchFileSnapshot(filepath: string, message?: string): Promise<void>
}

export interface ExpectPollOptions {
  interval?: number
  timeout?: number
  message?: string
}

export interface ExpectStatic
  extends PrimitiveExpectStatic,
    AsymmetricMatchersContaining {
  <T>(actual: T, message?: string): Assertion<void, T>
  soft<T>(actual: T, message?: string): Assertion<void, T>
  poll<T>(
    actual: (options: { signal: AbortSignal }) => T,
    options?: ExpectPollOptions
  ): Assertion<Promise<void>, Awaited<T>>
  not: AsymmetricMatchersContaining
  assert: typeof chai.assert
  unreachable(message?: string): never
  addSnapshotSerializer(plugin: Parameters<typeof addSerializer>[0]): void
  addEqualityTesters(
    testers: Parameters<typeof addCustomEqualityTesters>[0]
  ): void
  assertions(count: number): void
  hasAssertions(): void
}

export interface TestExpect extends ExpectStatic {}

type FacadeMatchers<R extends void | Promise<void>, T> = Matchers<R, T>

declare module '../../../compiled/next-test-primitives' {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends FacadeMatchers<R, T> {}
}
