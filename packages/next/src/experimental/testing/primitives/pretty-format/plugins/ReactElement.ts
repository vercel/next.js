/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Config, NewPlugin, Printer, Refs } from '../types'
import * as ReactIs19 from 'react-is'
import * as ReactIs18 from 'react-is-18'
import {
  printChildren,
  printElement,
  printElementAsLeaf,
  printProps,
} from './lib/markup'

const reactIsMethods = [
  'isAsyncMode',
  'isConcurrentMode',
  'isContextConsumer',
  'isContextProvider',
  'isElement',
  'isForwardRef',
  'isFragment',
  'isLazy',
  'isMemo',
  'isPortal',
  'isProfiler',
  'isStrictMode',
  'isSuspense',
  'isSuspenseList',
  'isValidElementType',
] as const

const ReactIs: typeof ReactIs18 = Object.fromEntries(
  reactIsMethods.map((m) => [
    m,
    (v: any) => ReactIs18[m](v) || (ReactIs19 as any)[m](v),
  ])
) as any

// Given element.props.children, or subtree during recursive traversal,
// return flattened array of children.
function getChildren(arg: unknown, children: Array<unknown> = []) {
  if (Array.isArray(arg)) {
    for (const item of arg) {
      getChildren(item, children)
    }
  } else if (arg != null && arg !== false && arg !== '') {
    children.push(arg)
  }
  return children
}

function getType(element: any) {
  const type = element.type
  if (typeof type === 'string') {
    return type
  }
  if (typeof type === 'function') {
    return type.displayName || type.name || 'Unknown'
  }

  if (ReactIs.isFragment(element)) {
    return 'React.Fragment'
  }
  if (ReactIs.isSuspense(element)) {
    return 'React.Suspense'
  }
  if (typeof type === 'object' && type !== null) {
    if (ReactIs.isContextProvider(element)) {
      return 'Context.Provider'
    }

    if (ReactIs.isContextConsumer(element)) {
      return 'Context.Consumer'
    }

    if (ReactIs.isForwardRef(element)) {
      if (type.displayName) {
        return type.displayName
      }

      const functionName = type.render.displayName || type.render.name || ''

      return functionName === '' ? 'ForwardRef' : `ForwardRef(${functionName})`
    }

    if (ReactIs.isMemo(element)) {
      const functionName =
        type.displayName || type.type.displayName || type.type.name || ''

      return functionName === '' ? 'Memo' : `Memo(${functionName})`
    }
  }
  return 'UNDEFINED'
}

function getPropKeys(element: any) {
  const { props } = element

  return Object.keys(props)
    .filter((key) => key !== 'children' && props[key] !== undefined)
    .sort()
}

const serialize: NewPlugin['serialize'] = (
  element: any,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
) =>
  ++depth > config.maxDepth
    ? printElementAsLeaf(getType(element), config)
    : printElement(
        getType(element),
        printProps(
          getPropKeys(element),
          element.props,
          config,
          indentation + config.indent,
          depth,
          refs,
          printer
        ),
        printChildren(
          getChildren(element.props.children),
          config,
          indentation + config.indent,
          depth,
          refs,
          printer
        ),
        config,
        indentation
      )

const test: NewPlugin['test'] = (val: unknown) =>
  val != null && ReactIs.isElement(val)

const plugin: NewPlugin = { serialize, test }

export default plugin
