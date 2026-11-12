/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Config, NewPlugin, Printer, Refs } from '../types'
import {
  printChildren,
  printElement,
  printElementAsLeaf,
  printProps,
} from './lib/markup'

interface ReactTestObject {
  $$typeof: symbol
  type: string
  props?: Record<string, unknown>
  children?: null | Array<ReactTestChild>
}

// Child can be `number` in Stack renderer but not in Fiber renderer.
type ReactTestChild = ReactTestObject | string | number

const testSymbol =
  typeof Symbol === 'function' && Symbol.for
    ? Symbol.for('react.test.json')
    : 0xe_a7_13_57

function getPropKeys(object: ReactTestObject) {
  const { props } = object

  return props
    ? Object.keys(props)
        .filter((key) => props[key] !== undefined)
        .sort()
    : []
}

const serialize: NewPlugin['serialize'] = (
  object: ReactTestObject,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
) =>
  ++depth > config.maxDepth
    ? printElementAsLeaf(object.type, config)
    : printElement(
        object.type,
        object.props
          ? printProps(
              getPropKeys(object),
              object.props,
              config,
              indentation + config.indent,
              depth,
              refs,
              printer
            )
          : '',
        object.children
          ? printChildren(
              object.children,
              config,
              indentation + config.indent,
              depth,
              refs,
              printer
            )
          : '',
        config,
        indentation
      )

const test: NewPlugin['test'] = (val) => val && val.$$typeof === testSymbol

const plugin: NewPlugin = { serialize, test }

export default plugin
