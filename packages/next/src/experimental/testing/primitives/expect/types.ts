/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { NextTestChai } from '../chai'
import type { MockInstance } from '../spy'
import type { Formatter } from '../utils/colors'
import type { AsymmetricMatcher } from './jest-asymmetric-matchers'
import type { diff, getMatcherUtils, stringify } from './jest-matcher-utils'

export type ChaiPlugin = NextTestChai.ChaiPlugin

export type Tester = (
  this: TesterContext,
  a: any,
  b: any,
  customTesters: Array<Tester>
) => boolean | undefined

export interface TesterContext {
  equals: (
    a: unknown,
    b: unknown,
    customTesters?: Array<Tester>,
    strictCheck?: boolean
  ) => boolean
}
export type { DiffOptions } from '../utils/diff'

export interface MatcherHintOptions {
  comment?: string
  expectedColor?: Formatter
  isDirectExpectCall?: boolean
  isNot?: boolean
  promise?: string
  receivedColor?: Formatter
  secondArgument?: string
  secondArgumentColor?: Formatter
}

export interface MatcherState {
  customTesters: Array<Tester>
  assertionCalls: number
  currentTestName?: string
  /**
   * @deprecated exists only in types
   */
  dontThrow?: () => void
  /**
   * @deprecated exists only in types
   */
  error?: Error
  equals: (
    a: unknown,
    b: unknown,
    customTesters?: Array<Tester>,
    strictCheck?: boolean
  ) => boolean
  /**
   * @deprecated exists only in types
   */
  expand?: boolean
  expectedAssertionsNumber?: number | null
  expectedAssertionsNumberErrorGen?: (() => Error) | null
  isExpectingAssertions?: boolean
  isExpectingAssertionsError?: Error | null
  isNot: boolean
  promise: string
  /**
   * @deprecated exists only in types
   */
  suppressedErrors: Array<Error>
  testPath?: string
  utils: ReturnType<typeof getMatcherUtils> & {
    diff: typeof diff
    stringify: typeof stringify
    iterableEquality: Tester
    subsetEquality: Tester
  }
  soft?: boolean
  poll?: boolean
  /**
   * The same assertion instance that chai plugins receive.
   * @experimental
   * @see {@link https://www.chaijs.com/guide/plugins/} Core Plugin Concepts
   */
  readonly assertion: Assertion
}

export interface SyncExpectationResult {
  pass: boolean
  message: () => string
  actual?: any
  expected?: any
  meta?: object
}

export type AsyncExpectationResult = Promise<SyncExpectationResult>

export type ExpectationResult = SyncExpectationResult | AsyncExpectationResult

export interface RawMatcherFn<
  T extends MatcherState = MatcherState,
  E extends Array<any> = Array<any>,
> {
  (this: T, received: any, ...expected: E): ExpectationResult
}

// Allow unused type parameters to preserve their names for extensions.
// Type parameter names must be identical when extending those types.
export interface Matchers<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Extensions require the same type parameter names.
  R extends void | Promise<void> = void | Promise<void>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Extensions require the same type parameter names.
  T = unknown,
> {}

export type MatchersObject<T extends MatcherState = MatcherState> = Record<
  string,
  RawMatcherFn<T>
> &
  ThisType<T> & {
    [K in keyof Matchers]?: RawMatcherFn<T, Parameters<Matchers[K]>>
  }

export interface ExpectStatic
  extends NextTestChai.ExpectStatic,
    Matchers<any>,
    AsymmetricMatchersContaining {
  <T>(actual: T, message?: string): Assertion<void, T>
  extend: (expects: MatchersObject) => void
  anything: () => any
  any: (constructor: unknown) => any
  getState: () => MatcherState
  setState: (state: Partial<MatcherState>) => void
  not: AsymmetricMatchersContaining
}

interface CustomMatcher<R = any> {
  /**
   * Checks that a value satisfies a custom matcher function.
   *
   * @param matcher - A function returning a boolean based on the custom condition
   * @param message - Optional custom error message on failure
   *
   * @example
   * expect(age).toSatisfy(val => val >= 18, 'Age must be at least 18');
   * expect(age).toEqual(expect.toSatisfy(val => val >= 18, 'Age must be at least 18'));
   */
  toSatisfy: (matcher: (value: any) => boolean, message?: string) => R

  /**
   * Matches if the received value is one of the values in the expected array or set.
   *
   * @example
   * expect(1).toBeOneOf([1, 2, 3])
   * expect('foo').toBeOneOf([expect.any(String)])
   * expect({ a: 1 }).toEqual({ a: expect.toBeOneOf(['1', '2', '3']) })
   */
  toBeOneOf: <T>(sample: ReadonlyArray<T> | ReadonlySet<T>) => R
}

export interface AsymmetricMatchersContaining
  extends Matchers<any>,
    CustomMatcher {
  /**
   * Matches if the received string contains the expected substring.
   *
   * @example
   * expect('I have an apple').toEqual(expect.stringContaining('apple'));
   * expect({ a: 'test string' }).toEqual({ a: expect.stringContaining('test') });
   */
  stringContaining: (expected: string) => any

  /**
   * Matches if the received object contains all properties of the expected object.
   *
   * @example
   * expect({ a: '1', b: 2 }).toEqual(expect.objectContaining({ a: '1' }))
   */
  objectContaining: <T = any>(expected: DeeplyAllowMatchers<T>) => any

  /**
   * Matches if the received array contains all elements in the expected array.
   *
   * @example
   * expect(['a', 'b', 'c']).toEqual(expect.arrayContaining(['b', 'a']));
   */
  arrayContaining: <T = unknown>(expected: Array<DeeplyAllowMatchers<T>>) => any

  /**
   * Matches if the received string or regex matches the expected pattern.
   *
   * @example
   * expect('hello world').toEqual(expect.stringMatching(/^hello/));
   * expect('hello world').toEqual(expect.stringMatching('hello'));
   */
  stringMatching: (expected: string | RegExp) => any

  /**
   * Matches if the received number is within a certain precision of the expected number.
   *
   * @example
   * expect(10.45).toEqual(expect.closeTo(10.5, 1));
   * expect(5.11).toEqual(expect.closeTo(5.12)); // with default precision
   */
  closeTo: (expected: number, precision?: number) => any

  /**
   * Matches if the received value validates against a Standard Schema.
   *
   * @param schema - A Standard Schema V1 compatible schema object
   *
   * @example
   * expect(user).toEqual(expect.schemaMatching(z.object({ name: z.string() })))
   * expect(['hello', 'world']).toEqual([expect.schemaMatching(z.string()), expect.schemaMatching(z.string())])
   */
  schemaMatching: (schema: unknown) => any
}

type WithAsymmetricMatcher<T> = T | AsymmetricMatcher<unknown>

export type DeeplyAllowMatchers<T> =
  T extends Array<infer Element>
    ? WithAsymmetricMatcher<T> | DeeplyAllowMatchers<Element>[]
    : T extends object
      ? WithAsymmetricMatcher<T> | { [K in keyof T]: DeeplyAllowMatchers<T[K]> }
      : WithAsymmetricMatcher<T>

export interface JestAssertion<
  R extends void | Promise<void>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Extensions require the same type parameter name.
  T = unknown,
> extends CustomMatcher<R> {
  /**
   * Used when you want to check that two objects have the same value.
   * This matcher recursively checks the equality of all fields, rather than checking for object identity.
   *
   * @example
   * expect(user).toEqual({ name: 'Alice', age: 30 });
   */
  toEqual: <E>(expected: E) => R

  /**
   * Use to test that objects have the same types as well as structure.
   *
   * @example
   * expect(user).toStrictEqual({ name: 'Alice', age: 30 });
   */
  toStrictEqual: <E>(expected: E) => R

  /**
   * Checks that a value is what you expect. It calls `Object.is` to compare values.
   * Don't use `toBe` with floating-point numbers.
   *
   * @example
   * expect(result).toBe(42);
   * expect(status).toBe(true);
   */
  toBe: <E>(expected: E) => R

  /**
   * Check that a string matches a regular expression.
   *
   * @example
   * expect(message).toMatch(/hello/);
   * expect(greeting).toMatch('world');
   */
  toMatch: (expected: string | RegExp) => R

  /**
   * Used to check that a JavaScript object matches a subset of the properties of an object
   *
   * @example
   * expect(user).toMatchObject({
   *   name: 'Alice',
   *   address: { city: 'Wonderland' }
   * });
   */
  toMatchObject: <E extends object | any[]>(expected: E) => R

  /**
   * Used when you want to check that an item is in a list.
   * For testing the items in the list, this uses `===`, a strict equality check.
   *
   * @example
   * expect(items).toContain('apple');
   * expect(numbers).toContain(5);
   */
  toContain: <E>(item: E) => R

  /**
   * Used when you want to check that an item is in a list.
   * For testing the items in the list, this matcher recursively checks the
   * equality of all fields, rather than checking for object identity.
   *
   * @example
   * expect(items).toContainEqual({ name: 'apple', quantity: 1 });
   */
  toContainEqual: <E>(item: E) => R

  /**
   * Use when you don't care what a value is, you just want to ensure a value
   * is true in a boolean context. In JavaScript, there are six falsy values:
   * `false`, `0`, `''`, `null`, `undefined`, and `NaN`. Everything else is truthy.
   *
   * @example
   * expect(user.isActive).toBeTruthy();
   */
  toBeTruthy: () => R

  /**
   * When you don't care what a value is, you just want to
   * ensure a value is false in a boolean context.
   *
   * @example
   * expect(user.isActive).toBeFalsy();
   */
  toBeFalsy: () => R

  /**
   * For comparing floating point numbers.
   *
   * @example
   * expect(score).toBeGreaterThan(10);
   */
  toBeGreaterThan: (num: number | bigint) => R

  /**
   * For comparing floating point numbers.
   *
   * @example
   * expect(score).toBeGreaterThanOrEqual(10);
   */
  toBeGreaterThanOrEqual: (num: number | bigint) => R

  /**
   * For comparing floating point numbers.
   *
   * @example
   * expect(score).toBeLessThan(10);
   */
  toBeLessThan: (num: number | bigint) => R

  /**
   * For comparing floating point numbers.
   *
   * @example
   * expect(score).toBeLessThanOrEqual(10);
   */
  toBeLessThanOrEqual: (num: number | bigint) => R

  /**
   * Used to check that a variable is NaN.
   *
   * @example
   * expect(value).toBeNaN();
   */
  toBeNaN: () => R

  /**
   * Used to check that a variable is undefined.
   *
   * @example
   * expect(value).toBeUndefined();
   */
  toBeUndefined: () => R

  /**
   * This is the same as `.toBe(null)` but the error messages are a bit nicer.
   * So use `.toBeNull()` when you want to check that something is null.
   *
   * @example
   * expect(value).toBeNull();
   */
  toBeNull: () => R

  /**
   * Used to check that a variable is nullable (null or undefined).
   *
   * @example
   * expect(value).toBeNullable();
   */
  toBeNullable: () => R

  /**
   * Ensure that a variable is not undefined.
   *
   * @example
   * expect(value).toBeDefined();
   */
  toBeDefined: () => R

  /**
   * Ensure that an object is an instance of a class.
   * This matcher uses `instanceof` underneath.
   *
   * @example
   * expect(new Date()).toBeInstanceOf(Date);
   */
  toBeInstanceOf: <E>(expected: E) => R

  /**
   * Used to check that an object has a `.length` property
   * and it is set to a certain numeric value.
   *
   * @example
   * expect([1, 2, 3]).toHaveLength(3);
   * expect('hello').toHaveLength(5);
   */
  toHaveLength: (length: number) => R

  /**
   * Use to check if a property at the specified path exists on an object.
   * For checking deeply nested properties, you may use dot notation or an array containing
   * the path segments for deep references.
   *
   * Optionally, you can provide a value to check if it matches the value present at the path
   * on the target object. This matcher uses 'deep equality' (like `toEqual()`) and recursively checks
   * the equality of all fields.
   *
   * @example
   * expect(user).toHaveProperty('address.city', 'New York');
   * expect(config).toHaveProperty(['settings', 'theme'], 'dark');
   */
  toHaveProperty: <E>(property: string | (string | number)[], value?: E) => R

  /**
   * Using exact equality with floating point numbers is a bad idea.
   * Rounding means that intuitive things fail.
   * The default for `numDigits` is 2.
   *
   * @example
   * expect(price).toBeCloseTo(9.99, 2);
   */
  toBeCloseTo: (number: number, numDigits?: number) => R

  /**
   * Ensures that a mock function is called an exact number of times.
   *
   * Also under the alias `expect.toBeCalledTimes`.
   *
   * @example
   * expect(mockFunc).toHaveBeenCalledTimes(2);
   */
  toHaveBeenCalledTimes: (times: number) => R

  /**
   * Ensures that a mock function is called an exact number of times.
   *
   * Alias for `expect.toHaveBeenCalledTimes`.
   *
   * @example
   * expect(mockFunc).toBeCalledTimes(2);
   * @deprecated Use `toHaveBeenCalledTimes` instead
   */
  toBeCalledTimes: (times: number) => R

  /**
   * Ensures that a mock function is called.
   *
   * Also under the alias `expect.toBeCalled`.
   *
   * @example
   * expect(mockFunc).toHaveBeenCalled();
   */

  toHaveBeenCalled: () => R

  /**
   * Ensures that a mock function is called.
   *
   * Alias for `expect.toHaveBeenCalled`.
   *
   * @example
   * expect(mockFunc).toBeCalled();
   * @deprecated Use `toHaveBeenCalled` instead
   */
  toBeCalled: () => R

  /**
   * Ensure that a mock function is called with specific arguments.
   *
   * Also under the alias `expect.toBeCalledWith`.
   *
   * @example
   * expect(mockFunc).toHaveBeenCalledWith('arg1', 42);
   */
  toHaveBeenCalledWith: <E extends any[]>(...args: E) => R

  /**
   * Ensure that a mock function is called with specific arguments.
   *
   * Alias for `expect.toHaveBeenCalledWith`.
   *
   * @example
   * expect(mockFunc).toBeCalledWith('arg1', 42);
   * @deprecated Use `toHaveBeenCalledWith` instead
   */
  toBeCalledWith: <E extends any[]>(...args: E) => R

  /**
   * Ensure that a mock function is called with specific arguments on an Nth call.
   *
   * Also under the alias `expect.nthCalledWith`.
   *
   * @example
   * expect(mockFunc).toHaveBeenNthCalledWith(2, 'secondArg');
   */
  toHaveBeenNthCalledWith: <E extends any[]>(n: number, ...args: E) => R

  /**
   * If you have a mock function, you can use `.toHaveBeenLastCalledWith`
   * to test what arguments it was last called with.
   *
   * Also under the alias `expect.lastCalledWith`.
   *
   * @example
   * expect(mockFunc).toHaveBeenLastCalledWith('lastArg');
   */
  toHaveBeenLastCalledWith: <E extends any[]>(...args: E) => R

  /**
   * Used to test that a function throws when it is called.
   *
   * Also under the alias `expect.toThrowError`.
   *
   * @example
   * expect(() => functionWithError()).toThrow('Error message');
   * expect(() => parseJSON('invalid')).toThrow(SyntaxError);
   * expect(() => { throw 42 }).toThrow(42);
   */
  toThrow: (expected?: any) => R

  /**
   * Used to test that a function throws when it is called.
   *
   * Alias for `expect.toThrow`.
   *
   * @example
   * expect(() => functionWithError()).toThrowError('Error message');
   * expect(() => parseJSON('invalid')).toThrowError(SyntaxError);
   * expect(() => { throw 42 }).toThrowError(42);
   * @deprecated Use `toThrow` instead
   */
  toThrowError: (expected?: any) => R

  /**
   * Use to test that the mock function successfully returned (i.e., did not throw an error) at least one time
   *
   * Alias for `expect.toHaveReturned`.
   *
   * @example
   * expect(mockFunc).toReturn();
   * @deprecated Use `toHaveReturned` instead
   */
  toReturn: () => R

  /**
   * Use to test that the mock function successfully returned (i.e., did not throw an error) at least one time
   *
   * Also under the alias `expect.toReturn`.
   *
   * @example
   * expect(mockFunc).toHaveReturned();
   */
  toHaveReturned: () => R

  /**
   * Use to ensure that a mock function returned successfully (i.e., did not throw an error) an exact number of times.
   * Any calls to the mock function that throw an error are not counted toward the number of times the function returned.
   *
   * Alias for `expect.toHaveReturnedTimes`.
   *
   * @example
   * expect(mockFunc).toReturnTimes(3);
   * @deprecated Use `toHaveReturnedTimes` instead
   */
  toReturnTimes: (times: number) => R

  /**
   * Use to ensure that a mock function returned successfully (i.e., did not throw an error) an exact number of times.
   * Any calls to the mock function that throw an error are not counted toward the number of times the function returned.
   *
   * Also under the alias `expect.toReturnTimes`.
   *
   * @example
   * expect(mockFunc).toHaveReturnedTimes(3);
   */
  toHaveReturnedTimes: (times: number) => R

  /**
   * Use to ensure that a mock function returned a specific value.
   *
   * Alias for `expect.toHaveReturnedWith`.
   *
   * @example
   * expect(mockFunc).toReturnWith('returnValue');
   * @deprecated Use `toHaveReturnedWith` instead
   */
  toReturnWith: <E>(value: E) => R

  /**
   * Use to ensure that a mock function returned a specific value.
   *
   * Also under the alias `expect.toReturnWith`.
   *
   * @example
   * expect(mockFunc).toHaveReturnedWith('returnValue');
   */
  toHaveReturnedWith: <E>(value: E) => R

  /**
   * Use to test the specific value that a mock function last returned.
   * If the last call to the mock function threw an error, then this matcher will fail
   * no matter what value you provided as the expected return value.
   *
   * Also under the alias `expect.lastReturnedWith`.
   *
   * @example
   * expect(mockFunc).toHaveLastReturnedWith('lastValue');
   */
  toHaveLastReturnedWith: <E>(value: E) => R

  /**
   * Use to test the specific value that a mock function returned for the nth call.
   * If the nth call to the mock function threw an error, then this matcher will fail
   * no matter what value you provided as the expected return value.
   *
   * Also under the alias `expect.nthReturnedWith`.
   *
   * @example
   * expect(mockFunc).toHaveNthReturnedWith(2, 'nthValue');
   */
  toHaveNthReturnedWith: <E>(nthCall: number, value: E) => R
}

type VitestAssertion<A, R extends void | Promise<void>, T = unknown> = {
  [K in keyof A]: A[K] extends NextTestChai.Assertion
    ? Assertion<R, T>
    : A[K] extends (...args: any[]) => any
      ? R extends Promise<void>
        ? PromisifyFunction<A[K]>
        : A[K]
      : VitestAssertion<A[K], R, T>
} & ((type: string, message?: string) => Assertion<R, T>)

type Promisify<O> = {
  [K in keyof O]: PromisifyFunction<O[K]>
}

type PromisifyFunction<T> = T extends (...args: infer A) => infer R
  ? Promisify<T> & ((...args: A) => R extends Promise<any> ? R : Promise<R>)
  : T

export type PromisifyAssertion<T> = Assertion<Promise<void>, Awaited<T>>

export interface Assertion<R extends void | Promise<void> = void, T = unknown>
  extends VitestAssertion<NextTestChai.Assertion, R, T>,
    JestAssertion<R, T>,
    ChaiMockAssertion<R, T>,
    Matchers<R, T> {
  /**
   * Ensures a value is of a specific type.
   *
   * @example
   * expect(value).toBeTypeOf('string');
   * expect(number).toBeTypeOf('number');
   */
  toBeTypeOf: (
    expected:
      | 'bigint'
      | 'boolean'
      | 'function'
      | 'number'
      | 'object'
      | 'string'
      | 'symbol'
      | 'undefined'
  ) => R

  /**
   * Asserts that a mock function was called exactly once.
   *
   * @example
   * expect(mockFunc).toHaveBeenCalledOnce();
   */
  toHaveBeenCalledOnce: () => R

  /**
   * Ensure that a mock function is called with specific arguments and called
   * exactly once.
   *
   * @example
   * expect(mockFunc).toHaveBeenCalledExactlyOnceWith('arg1', 42);
   */
  toHaveBeenCalledExactlyOnceWith: <E extends any[]>(...args: E) => R

  /**
   * This assertion checks if a `Mock` was called before another `Mock`.
   * @param mock - A mock function created by `vi.spyOn` or `vi.fn`
   * @param failIfNoFirstInvocation - Fail if the first mock was never called
   * @example
   * const mock1 = vi.fn()
   * const mock2 = vi.fn()
   *
   * mock1()
   * mock2()
   * mock1()
   *
   * expect(mock1).toHaveBeenCalledBefore(mock2)
   */
  toHaveBeenCalledBefore: (
    mock: MockInstance,
    failIfNoFirstInvocation?: boolean
  ) => R

  /**
   * This assertion checks if a `Mock` was called after another `Mock`.
   * @param mock - A mock function created by `vi.spyOn` or `vi.fn`
   * @param failIfNoFirstInvocation - Fail if the first mock was never called
   * @example
   * const mock1 = vi.fn()
   * const mock2 = vi.fn()
   *
   * mock2()
   * mock1()
   * mock2()
   *
   * expect(mock1).toHaveBeenCalledAfter(mock2)
   */
  toHaveBeenCalledAfter: (
    mock: MockInstance,
    failIfNoFirstInvocation?: boolean
  ) => R

  /**
   * Checks that at least one of the mock function's calls has resolved.
   *
   * @example
   * expect(mockAsyncFunc).toHaveResolved();
   */
  toHaveResolved: () => R

  /**
   * Checks that at least one of the mock function's calls has resolved to a specific value.
   *
   * @example
   * expect(mockAsyncFunc).toHaveResolvedWith('success');
   */
  toHaveResolvedWith: <E>(value: E) => R

  /**
   * Ensures a promise resolves a specific number of times.
   *
   * @example
   * expect(mockAsyncFunc).toHaveResolvedTimes(3);
   */
  toHaveResolvedTimes: (times: number) => R

  /**
   * Asserts that the last resolved value of a promise matches an expected value.
   *
   * @example
   * await expect(mockAsyncFunc).toHaveLastResolvedWith('finalResult');
   */
  toHaveLastResolvedWith: <E>(value: E) => R

  /**
   * Ensures a specific value was returned by a promise on the nth resolution.
   *
   * @example
   * await expect(mockAsyncFunc).toHaveNthResolvedWith(2, 'secondResult');
   */
  toHaveNthResolvedWith: <E>(nthCall: number, value: E) => R

  /**
   * Verifies that a promise resolves.
   *
   * @example
   * await expect(someAsyncFunc).resolves.toBe(42);
   */
  resolves: PromisifyAssertion<T>

  /**
   * Verifies that a promise rejects.
   *
   * @example
   * await expect(someAsyncFunc).rejects.toThrow('error');
   */
  rejects: PromisifyAssertion<unknown>
}

/**
 * Chai-style assertions for spy/mock testing.
 * These provide sinon-chai compatible assertion names that delegate to Jest-style implementations.
 */
export interface ChaiMockAssertion<
  R extends void | Promise<void>,
  T = unknown,
> {
  /**
   * Checks that a spy was called at least once.
   * Chai-style equivalent of `toHaveBeenCalled`.
   *
   * @example
   * expect(spy).to.have.been.called
   */
  readonly called: Assertion<R, T>

  /**
   * Checks that a spy was called a specific number of times.
   * Chai-style equivalent of `toHaveBeenCalledTimes`.
   *
   * @example
   * expect(spy).to.have.callCount(3)
   */
  callCount: (count: number) => R

  /**
   * Checks that a spy was called with specific arguments at least once.
   * Chai-style equivalent of `toHaveBeenCalledWith`.
   *
   * @example
   * expect(spy).to.have.been.calledWith('arg1', 'arg2')
   */
  calledWith: <E extends any[]>(...args: E) => R

  /**
   * Checks that a spy was called exactly once.
   * Chai-style equivalent of `toHaveBeenCalledOnce`.
   *
   * @example
   * expect(spy).to.have.been.calledOnce
   */
  readonly calledOnce: Assertion<R, T>

  /**
   * Checks that a spy was called exactly once with specific arguments.
   * Chai-style equivalent of `toHaveBeenCalledExactlyOnceWith`.
   *
   * @example
   * expect(spy).to.have.been.calledOnceWith('arg1', 'arg2')
   */
  calledOnceWith: <E extends any[]>(...args: E) => R

  /**
   * Checks that the last call to a spy was made with specific arguments.
   * Chai-style equivalent of `toHaveBeenLastCalledWith`.
   *
   * @example
   * expect(spy).to.have.been.lastCalledWith('arg1', 'arg2')
   */
  lastCalledWith: <E extends any[]>(...args: E) => R

  /**
   * Checks that the nth call to a spy was made with specific arguments.
   * Chai-style equivalent of `toHaveBeenNthCalledWith`.
   *
   * @example
   * expect(spy).to.have.been.nthCalledWith(2, 'arg1', 'arg2')
   */
  nthCalledWith: <E extends any[]>(n: number, ...args: E) => R

  /**
   * Checks that a spy returned a specific value at least once.
   * Chai-style equivalent of `toHaveReturnedWith`.
   *
   * @example
   * expect(spy).to.have.returned('value')
   */
  returned: <E>(value: E) => R

  /**
   * Checks that a spy returned a specific value at least once.
   * Chai-style equivalent of `toHaveReturnedWith`.
   *
   * @example
   * expect(spy).to.have.returnedWith('value')
   */
  returnedWith: <E>(value: E) => R

  /**
   * Checks that a spy returned successfully a specific number of times.
   * Chai-style equivalent of `toHaveReturnedTimes`.
   *
   * @example
   * expect(spy).to.have.returnedTimes(3)
   */
  returnedTimes: (count: number) => R

  /**
   * Checks that the last return value of a spy matches the expected value.
   * Chai-style equivalent of `toHaveLastReturnedWith`.
   *
   * @example
   * expect(spy).to.have.lastReturnedWith('value')
   */
  lastReturnedWith: <E>(value: E) => R

  /**
   * Checks that the nth return value of a spy matches the expected value.
   * Chai-style equivalent of `toHaveNthReturnedWith`.
   *
   * @example
   * expect(spy).to.have.nthReturnedWith(2, 'value')
   */
  nthReturnedWith: <E>(n: number, value: E) => R

  /**
   * Checks that a spy was called before another spy.
   * Chai-style equivalent of `toHaveBeenCalledBefore`.
   *
   * @example
   * expect(spy1).to.have.been.calledBefore(spy2)
   */
  calledBefore: (mock: MockInstance, failIfNoFirstInvocation?: boolean) => R

  /**
   * Checks that a spy was called after another spy.
   * Chai-style equivalent of `toHaveBeenCalledAfter`.
   *
   * @example
   * expect(spy1).to.have.been.calledAfter(spy2)
   */
  calledAfter: (mock: MockInstance, failIfNoFirstInvocation?: boolean) => R

  /**
   * Checks that a spy was called exactly twice.
   * Chai-style equivalent of `toHaveBeenCalledTimes(2)`.
   *
   * @example
   * expect(spy).to.have.been.calledTwice
   */
  readonly calledTwice: Assertion<R, T>

  /**
   * Checks that a spy was called exactly three times.
   * Chai-style equivalent of `toHaveBeenCalledTimes(3)`.
   *
   * @example
   * expect(spy).to.have.been.calledThrice
   */
  readonly calledThrice: Assertion<R, T>
}

export {}
