/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Config, NewPlugin, Printer, Refs } from '../types'
import { printListItems, printObjectProperties } from '../collections'

const SPACE = ' '

const OBJECT_NAMES = new Set(['DOMStringMap', 'NamedNodeMap'])
const ARRAY_REGEXP = /^(?:HTML\w*Collection|NodeList)$/

function testName(name: any) {
  return OBJECT_NAMES.has(name) || ARRAY_REGEXP.test(name)
}

const test: NewPlugin['test'] = (val: object) =>
  val &&
  val.constructor &&
  !!val.constructor.name &&
  testName(val.constructor.name)

function isNamedNodeMap(collection: object): collection is NamedNodeMap {
  return collection.constructor.name === 'NamedNodeMap'
}

const serialize: NewPlugin['serialize'] = (
  collection: any | NamedNodeMap,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
) => {
  const name = collection.constructor.name
  if (++depth > config.maxDepth) {
    return `[${name}]`
  }

  return (
    (config.min ? '' : name + SPACE) +
    (OBJECT_NAMES.has(name)
      ? `{${printObjectProperties(
          isNamedNodeMap(collection)
            ? [...collection].reduce<Record<string, string>>(
                (props, attribute) => {
                  props[attribute.name] = attribute.value
                  return props
                },
                {}
              )
            : { ...collection },
          config,
          indentation,
          depth,
          refs,
          printer
        )}}`
      : `[${printListItems([...collection], config, indentation, depth, refs, printer)}]`)
  )
}

const plugin: NewPlugin = { serialize, test }

export default plugin
