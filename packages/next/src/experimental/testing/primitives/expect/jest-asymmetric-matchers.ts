/* oxlint-disable unicorn/no-instanceof-builtins -- we check both */

import type { NextTestChai } from '../chai'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ChaiPlugin, MatcherState, Tester } from './types'
import { GLOBAL_EXPECT } from './constants'
import {
  diff,
  getCustomEqualityTesters,
  getMatcherUtils,
  stringify,
} from './jest-matcher-utils'
import {
  equals,
  isA,
  isStandardSchema,
  iterableEquality,
  pluralize,
  subsetEquality,
} from './jest-utils'
import { getState } from './state'

export interface AsymmetricMatcherInterface {
  asymmetricMatch: (other: unknown, customTesters?: Array<Tester>) => boolean
  toString: () => string
  getExpectedType?: () => string
  toAsymmetricMatcher?: () => string
}

export abstract class AsymmetricMatcher<
  T,
  State extends MatcherState = MatcherState,
> implements AsymmetricMatcherInterface
{
  // should have "jest" to be compatible with its ecosystem
  $$typeof: symbol = Symbol.for('jest.asymmetricMatcher')

  constructor(
    protected sample: T,
    protected inverse = false
  ) {}

  protected getMatcherContext(expect?: NextTestChai.ExpectStatic): State {
    return {
      ...getState(expect || (globalThis as any)[GLOBAL_EXPECT]),
      equals,
      isNot: this.inverse,
      customTesters: getCustomEqualityTesters(),
      utils: {
        ...getMatcherUtils(),
        diff,
        stringify,
        iterableEquality,
        subsetEquality,
      },
    }
  }

  abstract asymmetricMatch(
    other: unknown,
    customTesters?: Array<Tester>
  ): boolean
  abstract toString(): string
  getExpectedType?(): string
  toAsymmetricMatcher?(): string
}

// implement custom chai/loupe inspect for better AssertionError.message formatting
// https://github.com/chaijs/loupe/blob/9b8a6deabcd50adc056a64fb705896194710c5c6/src/index.ts#L29
const chaiInspectSymbol = Symbol.for('chai/inspect')
const inspectablePrototype =
  AsymmetricMatcher.prototype as typeof AsymmetricMatcher.prototype & {
    [chaiInspectSymbol]: (options: {
      depth: number
      truncate: number
    }) => string
  }
inspectablePrototype[chaiInspectSymbol] = function (options: {
  depth: number
  truncate: number
}): string {
  // minimal pretty-format with simple manual truncation
  const result = stringify(this, options.depth, { min: true })
  if (result.length <= options.truncate) {
    return result
  }
  return `${this.toString()}{…}`
}

export class StringContaining extends AsymmetricMatcher<string> {
  constructor(sample: string, inverse = false) {
    if (!isA('String', sample)) {
      throw new Error('Expected is not a string')
    }

    super(sample, inverse)
  }

  asymmetricMatch(other: string): boolean {
    const result = isA('String', other) && other.includes(this.sample)

    return this.inverse ? !result : result
  }

  toString() {
    return `String${this.inverse ? 'Not' : ''}Containing`
  }

  getExpectedType() {
    return 'string'
  }
}

export class Anything extends AsymmetricMatcher<void> {
  asymmetricMatch(other: unknown): boolean {
    return other != null
  }

  toString() {
    return 'Anything'
  }

  toAsymmetricMatcher() {
    return 'Anything'
  }
}

export class ObjectContaining extends AsymmetricMatcher<
  Record<string | symbol | number, unknown>
> {
  constructor(sample: Record<string, unknown>, inverse = false) {
    super(sample, inverse)
  }

  getPrototype(obj: object): any {
    if (Object.getPrototypeOf) {
      return Object.getPrototypeOf(obj)
    }

    if (obj.constructor.prototype === obj) {
      return null
    }

    return obj.constructor.prototype
  }

  hasProperty(obj: object | null, property: string | symbol): boolean {
    if (!obj) {
      return false
    }

    if (Object.hasOwn(obj, property)) {
      return true
    }

    return this.hasProperty(this.getPrototype(obj), property)
  }

  getProperties(obj: object): (string | symbol)[] {
    return [
      ...Object.keys(obj),
      ...Object.getOwnPropertySymbols(obj).filter(
        (s) => Object.getOwnPropertyDescriptor(obj, s)?.enumerable
      ),
    ]
  }

  asymmetricMatch(other: any, customTesters?: Array<Tester>): boolean {
    if (typeof this.sample !== 'object') {
      throw new TypeError(
        `You must provide an object to ${this.toString()}, not '${typeof this.sample}'.`
      )
    }

    let result = true

    const properties = this.getProperties(this.sample)
    for (const property of properties) {
      if (!this.hasProperty(other, property)) {
        result = false
        break
      }
      const value = this.sample[property]
      const otherValue = other[property]
      if (!equals(value, otherValue, customTesters)) {
        result = false
        break
      }
    }

    return this.inverse ? !result : result
  }

  toString() {
    return `Object${this.inverse ? 'Not' : ''}Containing`
  }

  getExpectedType() {
    return 'object'
  }
}

export class ArrayContaining<T = unknown> extends AsymmetricMatcher<Array<T>> {
  constructor(sample: Array<T>, inverse = false) {
    super(sample, inverse)
  }

  asymmetricMatch(other: Array<T>, customTesters?: Array<Tester>): boolean {
    if (!Array.isArray(this.sample)) {
      throw new TypeError(
        `You must provide an array to ${this.toString()}, not '${typeof this.sample}'.`
      )
    }

    const result =
      this.sample.length === 0 ||
      (Array.isArray(other) &&
        this.sample.every((item) =>
          other.some((another) => equals(item, another, customTesters))
        ))

    return this.inverse ? !result : result
  }

  toString() {
    return `Array${this.inverse ? 'Not' : ''}Containing`
  }

  getExpectedType() {
    return 'array'
  }
}

export class Any extends AsymmetricMatcher<any> {
  constructor(sample: unknown) {
    if (typeof sample === 'undefined') {
      throw new TypeError(
        'any() expects to be passed a constructor function. ' +
          'Please pass one or use anything() to match any object.'
      )
    }
    super(sample)
  }

  fnNameFor(func: Function): string {
    if (func.name) {
      return func.name
    }

    const functionToString = Function.prototype.toString

    const matches = functionToString
      .call(func)
      .match(/^(?:async)?\s*function\s*(?:\*\s*)?([\w$]+)\s*\(/)
    return matches ? matches[1] : '<anonymous>'
  }

  asymmetricMatch(other: unknown): boolean {
    if (this.sample === String) {
      return typeof other == 'string' || other instanceof String
    }

    if (this.sample === Number) {
      return typeof other == 'number' || other instanceof Number
    }

    if (this.sample === Function) {
      return typeof other == 'function' || typeof other === 'function'
    }

    if (this.sample === Boolean) {
      return typeof other == 'boolean' || other instanceof Boolean
    }

    if (this.sample === BigInt) {
      return typeof other == 'bigint' || other instanceof BigInt
    }

    if (this.sample === Symbol) {
      return typeof other == 'symbol' || other instanceof Symbol
    }

    if (this.sample === Object) {
      return typeof other == 'object'
    }

    return other instanceof this.sample
  }

  toString() {
    return 'Any'
  }

  getExpectedType(): string {
    if (this.sample === String) {
      return 'string'
    }

    if (this.sample === Number) {
      return 'number'
    }

    if (this.sample === Function) {
      return 'function'
    }

    if (this.sample === Object) {
      return 'object'
    }

    if (this.sample === Boolean) {
      return 'boolean'
    }

    return this.fnNameFor(this.sample)
  }

  toAsymmetricMatcher() {
    return `Any<${this.fnNameFor(this.sample)}>`
  }
}

export class StringMatching extends AsymmetricMatcher<RegExp> {
  constructor(sample: string | RegExp, inverse = false) {
    if (!isA('String', sample) && !isA('RegExp', sample)) {
      throw new Error('Expected is not a String or a RegExp')
    }

    super(new RegExp(sample), inverse)
  }

  asymmetricMatch(other: string): boolean {
    const result = isA('String', other) && this.sample.test(other)

    return this.inverse ? !result : result
  }

  toString() {
    return `String${this.inverse ? 'Not' : ''}Matching`
  }

  getExpectedType() {
    return 'string'
  }
}

class CloseTo extends AsymmetricMatcher<number> {
  private readonly precision: number

  constructor(sample: number, precision = 2, inverse = false) {
    if (!isA('Number', sample)) {
      throw new Error('Expected is not a Number')
    }

    if (!isA('Number', precision)) {
      throw new Error('Precision is not a Number')
    }

    super(sample)
    this.inverse = inverse
    this.precision = precision
  }

  asymmetricMatch(other: number) {
    if (!isA('Number', other)) {
      return false
    }

    let result = false
    if (
      other === Number.POSITIVE_INFINITY &&
      this.sample === Number.POSITIVE_INFINITY
    ) {
      result = true // Infinity - Infinity is NaN
    } else if (
      other === Number.NEGATIVE_INFINITY &&
      this.sample === Number.NEGATIVE_INFINITY
    ) {
      result = true // -Infinity - -Infinity is NaN
    } else {
      result = Math.abs(this.sample - other) < 10 ** -this.precision / 2
    }
    return this.inverse ? !result : result
  }

  toString() {
    return `Number${this.inverse ? 'Not' : ''}CloseTo`
  }

  override getExpectedType() {
    return 'number'
  }

  override toAsymmetricMatcher(): string {
    return [
      this.toString(),
      this.sample,
      `(${pluralize('digit', this.precision)})`,
    ].join(' ')
  }
}

export class SchemaMatching extends AsymmetricMatcher<
  StandardSchemaV1<unknown, unknown>
> {
  private result: StandardSchemaV1.Result<unknown> | undefined

  constructor(sample: StandardSchemaV1<unknown, unknown>, inverse = false) {
    if (!isStandardSchema(sample)) {
      throw new TypeError(
        'SchemaMatching expected to receive a Standard Schema.'
      )
    }
    super(sample, inverse)
  }

  asymmetricMatch(other: unknown): boolean {
    const result = this.sample['~standard'].validate(other)

    // Check if the result is a Promise (async validation)
    if (result instanceof Promise) {
      throw new TypeError(
        'Async schema validation is not supported in asymmetric matchers.'
      )
    }

    this.result = result
    const pass = !this.result.issues || this.result.issues.length === 0

    return this.inverse ? !pass : pass
  }

  toString() {
    return `Schema${this.inverse ? 'Not' : ''}Matching`
  }

  getExpectedType() {
    return 'object'
  }

  toAsymmetricMatcher(): string {
    const { utils } = this.getMatcherContext()
    const issues = this.result?.issues || []
    if (issues.length > 0) {
      return `${this.toString()} ${utils.stringify(this.result, undefined, { printBasicPrototype: false })}`
    }
    return this.toString()
  }
}

export const JestAsymmetricMatchers: ChaiPlugin = (chai, utils) => {
  utils.addMethod(chai.expect, 'anything', () => new Anything())

  utils.addMethod(chai.expect, 'any', (expected: unknown) => new Any(expected))

  utils.addMethod(
    chai.expect,
    'stringContaining',
    (expected: string) => new StringContaining(expected)
  )

  utils.addMethod(
    chai.expect,
    'objectContaining',
    (expected: any) => new ObjectContaining(expected)
  )

  utils.addMethod(
    chai.expect,
    'arrayContaining',
    <T = any>(expected: Array<T>) => new ArrayContaining<T>(expected)
  )

  utils.addMethod(
    chai.expect,
    'stringMatching',
    (expected: any) => new StringMatching(expected)
  )

  utils.addMethod(
    chai.expect,
    'closeTo',
    (expected: any, precision?: number) => new CloseTo(expected, precision)
  )

  utils.addMethod(
    chai.expect,
    'schemaMatching',
    (expected: any) => new SchemaMatching(expected)
  )

  // defineProperty does not work
  ;(chai.expect as any).not = {
    stringContaining: (expected: string) =>
      new StringContaining(expected, true),
    objectContaining: (expected: any) => new ObjectContaining(expected, true),
    arrayContaining: <T = unknown>(expected: Array<T>) =>
      new ArrayContaining<T>(expected, true),
    stringMatching: (expected: string | RegExp) =>
      new StringMatching(expected, true),
    closeTo: (expected: any, precision?: number) =>
      new CloseTo(expected, precision, true),
    schemaMatching: (expected: any) => new SchemaMatching(expected, true),
  }
}
