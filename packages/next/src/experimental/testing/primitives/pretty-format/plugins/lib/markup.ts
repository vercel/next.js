/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Config, Printer, Refs } from '../../types'
import escapeHTML from './escapeHTML'

// Return empty string if keys is empty.
export function printProps(
  keys: Array<string>,
  props: Record<string, unknown>,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
): string {
  const indentationNext = indentation + config.indent
  const colors = config.colors
  return keys
    .map((key) => {
      const value = props[key]
      // hidden injected value that should not be printed
      if (
        typeof value === 'string' &&
        value[0] === '_' &&
        value.startsWith('__vitest_') &&
        /__vitest_\d+__/.test(value)
      ) {
        return ''
      }

      let printed = printer(value, config, indentationNext, depth, refs)

      if (typeof value !== 'string') {
        if (printed.includes('\n')) {
          printed =
            config.spacingOuter +
            indentationNext +
            printed +
            config.spacingOuter +
            indentation
        }
        printed = `{${printed}}`
      }

      return `${
        config.spacingInner +
        indentation +
        colors.prop.open +
        key +
        colors.prop.close
      }=${colors.value.open}${printed}${colors.value.close}`
    })
    .join('')
}

// Return empty string if children is empty.
export function printChildren(
  children: Array<unknown>,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
): string {
  return children
    .map(
      (child) =>
        config.spacingOuter +
        indentation +
        (typeof child === 'string'
          ? printText(child, config)
          : printer(child, config, indentation, depth, refs))
    )
    .join('')
}

export function printShadowRoot(
  children: Array<unknown>,
  config: Config,
  indentation: string,
  depth: number,
  refs: Refs,
  printer: Printer
): string {
  if (config.printShadowRoot === false) {
    return ''
  }
  return [
    `${config.spacingOuter + indentation}#shadow-root`,
    printChildren(
      children,
      config,
      indentation + config.indent,
      depth,
      refs,
      printer
    ),
  ].join('')
}

export function printText(text: string, config: Config): string {
  const contentColor = config.colors.content
  return contentColor.open + escapeHTML(text) + contentColor.close
}

export function printComment(comment: string, config: Config): string {
  const commentColor = config.colors.comment
  return `${commentColor.open}<!--${escapeHTML(comment)}-->${commentColor.close}`
}

// Separate the functions to format props, children, and element,
// so a plugin could override a particular function, if needed.
// Too bad, so sad: the traditional (but unnecessary) space
// in a self-closing tagColor requires a second test of printedProps.
export function printElement(
  type: string,
  printedProps: string,
  printedChildren: string,
  config: Config,
  indentation: string
): string {
  const tagColor = config.colors.tag
  return `${tagColor.open}<${type}${
    printedProps &&
    tagColor.close +
      printedProps +
      config.spacingOuter +
      indentation +
      tagColor.open
  }${
    printedChildren
      ? `>${tagColor.close}${printedChildren}${config.spacingOuter}${indentation}${tagColor.open}</${type}`
      : `${printedProps && !config.min ? '' : ' '}/`
  }>${tagColor.close}`
}

export function printElementAsLeaf(type: string, config: Config): string {
  const tagColor = config.colors.tag
  return `${tagColor.open}<${type}${tagColor.close} …${tagColor.open} />${tagColor.close}`
}
