/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Config, NewPlugin, Printer, Refs } from '../types'
import {
  printChildren,
  printComment,
  printElement,
  printElementAsLeaf,
  printProps,
  printShadowRoot,
  printText,
} from './lib/markup'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const COMMENT_NODE = 8
const FRAGMENT_NODE = 11

const ELEMENT_REGEXP = /^(?:(?:HTML|SVG)\w*)?Element$/

function testHasAttribute(val: any) {
  try {
    return typeof val.hasAttribute === 'function' && val.hasAttribute('is')
  } catch {
    return false
  }
}

function testNode(val: any) {
  const constructorName = val.constructor.name
  const { nodeType, tagName } = val
  const isCustomElement =
    (typeof tagName === 'string' && tagName.includes('-')) ||
    testHasAttribute(val)

  return (
    (nodeType === ELEMENT_NODE &&
      (ELEMENT_REGEXP.test(constructorName) || isCustomElement)) ||
    (nodeType === TEXT_NODE && constructorName === 'Text') ||
    (nodeType === COMMENT_NODE && constructorName === 'Comment') ||
    (nodeType === FRAGMENT_NODE && constructorName === 'DocumentFragment')
  )
}

const test: NewPlugin['test'] = (val: any) =>
  val?.constructor?.name && testNode(val)

type HandledType = Element | Text | Comment | DocumentFragment

function nodeIsText(node: HandledType): node is Text {
  return node.nodeType === TEXT_NODE
}

function nodeIsComment(node: HandledType): node is Comment {
  return node.nodeType === COMMENT_NODE
}

function nodeIsFragment(node: HandledType): node is DocumentFragment {
  return node.nodeType === FRAGMENT_NODE
}

function filterChildren(
  children: any[],
  filterNode?: (node: any) => boolean
): any[] {
  // Filter out text nodes that only contain whitespace to prevent empty lines
  // This is done regardless of whether a filterNode is provided
  let filtered = children.filter((node) => {
    // Filter out text nodes that are only whitespace
    if (node.nodeType === TEXT_NODE) {
      const text = node.data || ''
      // Keep text nodes that have non-whitespace content
      return text.trim().length > 0
    }
    return true
  })

  // Apply additional user-provided filter if specified
  if (filterNode) {
    filtered = filtered.filter(filterNode)
  }

  return filtered
}

function serializeDOM(
  node: HandledType,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer,
  filterNode?: (node: any) => boolean
) {
  if (nodeIsText(node)) {
    return printText(node.data, config)
  }

  if (nodeIsComment(node)) {
    return printComment(node.data, config)
  }

  const type = nodeIsFragment(node)
    ? 'DocumentFragment'
    : node.tagName.toLowerCase()

  if (++depth > config.maxDepth) {
    return printElementAsLeaf(type, config)
  }

  const children = Array.prototype.slice.call(node.childNodes || node.children)
  const shadowChildren =
    nodeIsFragment(node) || !node.shadowRoot
      ? []
      : Array.prototype.slice.call(node.shadowRoot.children)

  const resolvedChildren = filterNode
    ? filterChildren(children, filterNode)
    : children
  const resolvedShadowChildren = filterNode
    ? filterChildren(shadowChildren, filterNode)
    : shadowChildren

  return printElement(
    type,
    printProps(
      nodeIsFragment(node)
        ? []
        : Array.from(node.attributes, (attr) => attr.name).sort(),
      nodeIsFragment(node)
        ? {}
        : [...node.attributes].reduce<Record<string, string>>(
            (props, attribute) => {
              props[attribute.name] = attribute.value
              return props
            },
            {}
          ),
      config,
      indentation + config.indent,
      depth,
      refs,
      printer
    ),
    (resolvedShadowChildren.length > 0
      ? printShadowRoot(
          resolvedShadowChildren,
          config,
          indentation + config.indent,
          depth,
          refs,
          printer
        )
      : '') +
      printChildren(
        resolvedChildren,
        config,
        indentation + config.indent,
        depth,
        refs,
        printer
      ),
    config,
    indentation
  )
}

const serialize: NewPlugin['serialize'] = (
  node: HandledType,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
) => serializeDOM(node, config, indentation, depth, refs, printer)

export function createDOMElementFilter(
  filterNode?: (node: any) => boolean
): NewPlugin {
  return {
    test,
    serialize: (
      node: HandledType,
      config: Config,
      indentation: string,
      depth: number,
      refs: Refs,
      printer: Printer
    ) =>
      serializeDOM(node, config, indentation, depth, refs, printer, filterNode),
  }
}

const plugin: NewPlugin = { serialize, test }

export default plugin
