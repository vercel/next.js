import { a as a6 } from 'package-reexport-side-effect'
import { effects as effects6 } from 'package-reexport-side-effect/check-side-effect'
it('should run side effects of a reexporting module with side effects', () => {
  expect(a6).toBe('a')
  expect(effects6).toEqual(['side-effect.js', 'side-effect2.js', 'index.js'])
})

import { a as a7 } from 'package-reexport-tla-side-effect'
import { effects as effects7 } from 'package-reexport-tla-side-effect/check-side-effect'
it('should run side effects of a reexporting module with side effects (async modules)', () => {
  expect(a7).toBe('a')
  expect(effects7).toEqual(['side-effect.js', 'side-effect2.js', 'index.js'])
})

import { effects as effects8 } from 'package-require-side-effect/check-side-effect'
it('should run side effects of a reexporting module with side effects (async modules)', () => {
  expect(effects8).toEqual([])
  require('package-require-side-effect')
  expect(effects8).toEqual(['side-effect.js', 'side-effect2.js', 'index.js'])
})

import { a as a9 } from 'package-intermediate-side-effect'
import { effects as effects9 } from 'package-intermediate-side-effect/check-side-effect'
it('should run side effects of an intermediate module with side effects (star reexports)', () => {
  expect(a9).toBe('a')
  expect(effects9).toEqual(['side-effect.js'])
})

import { a as a10 } from 'package-intermediate-named-side-effect'
import { effects as effects10 } from 'package-intermediate-named-side-effect/check-side-effect'
it('should run side effects of an intermediate module with side effects (named reexports)', () => {
  expect(a10).toBe('a')
  expect(effects10).toEqual(['side-effect.js'])
})

import { a as a11 } from 'package-intermediate-mixed-star-side-effect'
import { effects as effects11 } from 'package-intermediate-mixed-star-side-effect/check-side-effect'
it('should preserve evaluation order across a mixed star reexport route', () => {
  expect(a11).toBe('a')
  expect(effects11).toEqual(['effect-2.js', 'effect-1.js'])
})

import {
  selected as selected12,
  dynamicValue as dynamicValue12,
} from 'package-intermediate-ambiguous-dynamic-side-effect'
import * as namespace12 from 'package-intermediate-ambiguous-dynamic-side-effect'
import { effects as effects12 } from 'package-intermediate-ambiguous-dynamic-side-effect/check-side-effect'
it('should preserve star ambiguity and dynamic fallback through an effectful route', () => {
  expect(selected12).toBe('selected')
  expect(dynamicValue12).toBe('dynamic')
  expect(namespace12.ambiguous).toBe('right')
  expect(effects12).toEqual(['effect.js'])
})
