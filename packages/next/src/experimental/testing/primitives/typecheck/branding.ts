/**
 * Copyright 2024 Misha Kaletsky
 * SPDX-License-Identifier: Apache-2.0
 *
 * Based on expect-type 1.4.0, commit 48743118a1da38f84269f9f6970c6861614092e0.
 * Modified for Next.js source ownership and repository formatting.
 * See LICENSE for the full license text.
 */

/* eslint-disable jsdoc/no-undefined-types -- Upstream links refer to generic parameters and interface members. */

import type {
  ConstructorOverloadParameters,
  NumOverloads,
  OverloadsInfoUnion,
} from './overloads'
import type {
  IsNever,
  IsAny,
  IsUnknown,
  ReadonlyKeys,
  RequiredKeys,
  OptionalKeys,
  MutuallyExtends,
  UnionToTuple,
  IsTuple,
  UnionToIntersection,
  TupleToRecord,
  IsRecord,
} from './utils'

export type DeepBrandOptions = {
  nominalTypes: {}
}

export type DeepBrandOptionsDefaults = {
  nominalTypes: {
    Date: Date
  }
}

export type NominalType<
  T,
  Options extends DeepBrandOptions,
> = Options['nominalTypes'] extends infer N
  ? {
      [K in keyof N]: MutuallyExtends<N[K], T> extends true ? K : never
    }[keyof N]
  : never

/**
 * Represents a deeply branded type.
 *
 * Recursively walk a type and replace it with a branded type related to the
 * original. This is useful for equality-checking stricter than
 * `A extends B ? B extends A ? true : false : false`, because it detects the
 * difference between a few edge-case types that vanilla TypeScript
 * doesn't by default:
 * - `any` vs `unknown`
 * - `{ readonly a: string }` vs `{ a: string }`
 * - `{ a?: string }` vs `{ a: string | undefined }`
 *
 * __Note__: not very performant for complex types - this should only be used
 * when you know you need it. If doing an equality check, it's almost always
 * better to use {@linkcode StrictEqualUsingTSInternalIdenticalToOperator}.
 */
export type DeepBrand<T, Options extends DeepBrandOptions> =
  IsNever<T> extends true
    ? { type: 'never' }
    : IsAny<T> extends true
      ? { type: 'any' }
      : IsUnknown<T> extends true
        ? { type: 'unknown' }
        : NominalType<T, Options> extends infer Nominal
          ? IsNever<Nominal> extends true
            ? T extends
                | string
                | number
                | boolean
                | symbol
                | bigint
                | null
                | undefined
                | void
              ? {
                  type: 'primitive'
                  value: T
                }
              : T extends new (...args: any[]) => any
                ? {
                    type: 'constructor'
                    params: ConstructorOverloadParameters<T>
                    instance: DeepBrand<
                      InstanceType<Extract<T, new (...args: any) => any>>,
                      Options
                    >
                  }
                : T extends (...args: infer P) => infer R // avoid functions with different params/return values matching
                  ? NumOverloads<T> extends 1
                    ? {
                        type: 'function'
                        params: DeepBrand<P, Options>
                        return: DeepBrand<R, Options>
                        this: DeepBrand<ThisParameterType<T>, Options>
                        props: DeepBrand<Omit<T, keyof Function>, Options>
                      }
                    : UnionToTuple<
                          OverloadsInfoUnion<T>
                        > extends infer OverloadsTuple
                      ? {
                          type: 'overloads'
                          overloads: {
                            [K in keyof OverloadsTuple]: DeepBrand<
                              OverloadsTuple[K],
                              Options
                            >
                          }
                        }
                      : never
                  : T extends any[]
                    ? IsTuple<T> extends true
                      ? {
                          type: 'tuple'
                          items: {
                            [K in keyof T]: DeepBrand<T[K], Options>
                          }
                        }
                      : {
                          type: 'array'
                          items: DeepBrand<T[number], Options>
                        }
                    : IsRecord<T> extends true
                      ? {
                          type: 'record'
                          keys: keyof T
                          values: DeepBrand<T[keyof T], Options>
                        }
                      : {
                          type: 'object'
                          properties: {
                            [K in keyof T]: DeepBrand<T[K], Options>
                          }
                          readonly: ReadonlyKeys<T>
                          required: RequiredKeys<T>
                          optional: OptionalKeys<T>
                          constructorParams: ConstructorOverloadParameters<T> extends infer P
                            ? IsNever<P> extends true
                              ? never
                              : DeepBrand<P, Options>
                            : never
                        }
            : { type: Nominal }
          : never

/**
 * Checks if two types are strictly equal using branding.
 */
export type StrictEqualUsingBranding<
  Left,
  Right,
  Options extends DeepBrandOptions,
> = MutuallyExtends<DeepBrand<Left, Options>, DeepBrand<Right, Options>>

/**
 * Internal type helper; do not use unless you are deeply familiar with it!
 *
 * Walks over a type `T`, assuming that it's the output of the {@linkcode DeepBrand} utility. It looks for leaf nodes looking like `{type: FindType}`.
 * When it finds them, it merges them into a string->string record, keeping track of a rough representation of the path-location.
 * For simple objects, this path will roughly match dot-prop notation but it also traverses into all the structures that `DeepBrand` can emit.
 * But it also goes into overloads, function parameters, return types, etc. The output is an ugly intersection of objects along with a marker `{deepBrandLeafNode: true}`
 * which is purely for internal use. The output should not be shown to end-users!
 */
type _DeepPropTypesOfBranded<
  T,
  PathTo extends string,
  FindType extends string,
> =
  IsNever<T> extends true
    ? {}
    : T extends string
      ? {}
      : T extends { type: FindType }
        ? { [K in PathTo]: T['type'] } & { deepBrandLeafNode: true } // deepBrandLeafNode marker helps us throw out lots of array props which we don't want to include
        : T extends any[]
          ? _DeepPropTypesOfBranded<TupleToRecord<T>, PathTo, FindType>
          : UnionToIntersection<
              {
                [K in keyof T]: Extract<
                  _DeepPropTypesOfBranded<
                    T[K],
                    `${PathTo}${DeepBrandPropPathSuffix<T, Prop<K>>}`,
                    FindType
                  >,
                  { deepBrandLeafNode: true }
                >
              }[keyof T]
            >

/** Required options for for {@linkcode DeepBrandPropNotes}. */
export type DeepBrandPropNotesOptions = Partial<DeepBrandOptions> & {
  findType: 'any' | 'never' | 'unknown'
}
/** Default options for for {@linkcode DeepBrandPropNotes}. */
export type DeepBrandPropNotesOptionsDefaults = { findType: 'any' | 'never' }

/**
 * For an input type `T`, finds all deeply-nested properties in the {@linkcode DeepBrand} representation of it.
 *
 * The output is a developer-readable shallow record of prop-path -> resolved type.
 * @example
 * ```ts
 * type X = {a: any; b: boolean; c: {d: any}}
 * const notes: DeepBrandPropNotes<X, {findType: 'any'}> = {
 *   '.a': 'any',
 *   '.c.d': 'any',
 * }
 * ```
 */
export type DeepBrandPropNotes<T, Options extends DeepBrandPropNotesOptions> =
  _DeepPropTypesOfBranded<
    DeepBrand<T, DeepBrandOptionsDefaults & Options>,
    '',
    Options['findType']
  > extends infer X
    ? {} extends X
      ? Record<string | number | symbol, 'No flagged props found!'> // avoid letting `{'.propThatUsedToBeAny': 'any'}` still being accepted after it's fixed
      : { [K in Exclude<keyof X, 'deepBrandLeafNode'>]: X[K] }
    : never

/**
 * Internal type helper.
 *
 * Helper to coerce a type `K` that you are already pretty sure is a string because it camed from a `keyof T` type expression.
 * Useful because sometimes TypeScript forgets that.
 * When it's not a string or number, it will output a big ugly literal type `'UNEXPECTED_NON_LITERAL_PROP'` - try to avoid this!
 */
export type Prop<K> = K extends string | number
  ? K
  : 'UNEXPECTED_NON_LITERAL_PROP'

/**
 * Gets a sensible suffix to a property path for a {@linkcode DeepBrand} output type.
 * `[number]` for arrays, empty string for objects, and parenthesised-input for anything else.
 */
type DeepBrandPropPathSuffix<T, K> = T extends { type: string }
  ? K extends 'items'
    ? '[number]'
    : K extends 'properties'
      ? ''
      : `(${Prop<K>})`
  : `.${Prop<K>}`
