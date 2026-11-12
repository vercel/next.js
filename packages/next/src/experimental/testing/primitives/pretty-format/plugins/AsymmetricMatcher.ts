/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Config, NewPlugin, Printer, Refs } from '../types'
import { printListItems, printObjectProperties } from '../collections'

const asymmetricMatcher =
  typeof Symbol === 'function' && Symbol.for
    ? Symbol.for('jest.asymmetricMatcher')
    : 0x13_57_a5
const SPACE = ' '

const serialize: NewPlugin['serialize'] = (
  val: any,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
) => {
  const stringedValue = val.toString()

  if (
    stringedValue === 'ArrayContaining' ||
    stringedValue === 'ArrayNotContaining'
  ) {
    if (++depth > config.maxDepth) {
      return `[${stringedValue}]`
    }
    return `${stringedValue + SPACE}[${printListItems(
      val.sample,
      config,
      indentation,
      depth,
      refs,
      printer
    )}]`
  }

  if (
    stringedValue === 'ObjectContaining' ||
    stringedValue === 'ObjectNotContaining'
  ) {
    if (++depth > config.maxDepth) {
      return `[${stringedValue}]`
    }
    return `${stringedValue + SPACE}{${printObjectProperties(
      val.sample,
      config,
      indentation,
      depth,
      refs,
      printer
    )}}`
  }

  if (
    stringedValue === 'StringMatching' ||
    stringedValue === 'StringNotMatching'
  ) {
    return (
      stringedValue +
      SPACE +
      printer(val.sample, config, indentation, depth, refs)
    )
  }

  if (
    stringedValue === 'StringContaining' ||
    stringedValue === 'StringNotContaining'
  ) {
    return (
      stringedValue +
      SPACE +
      printer(val.sample, config, indentation, depth, refs)
    )
  }

  if (typeof val.toAsymmetricMatcher !== 'function') {
    throw new TypeError(
      `Asymmetric matcher ${val.constructor.name} does not implement toAsymmetricMatcher()`
    )
  }

  return val.toAsymmetricMatcher()
}

const test: NewPlugin['test'] = (val: any) =>
  val && val.$$typeof === asymmetricMatcher

const plugin: NewPlugin = { serialize, test }

export default plugin
