import type { PrettyFormatOptions } from '../pretty-format/index'
import {
  createDOMElementFilter,
  format as prettyFormat,
  plugins as prettyFormatPlugins,
} from '../pretty-format/index'

const {
  AsymmetricMatcher,
  DOMCollection,
  DOMElement,
  Immutable,
  ReactElement,
  ReactTestComponent,
} = prettyFormatPlugins

const PLUGINS = [
  ReactTestComponent,
  ReactElement,
  DOMElement,
  DOMCollection,
  Immutable,
  AsymmetricMatcher,
]

export interface StringifyOptions extends PrettyFormatOptions {
  maxLength?: number
  filterNode?: string | ((node: any) => boolean)
}

export function stringify(
  object: unknown,
  maxDepth = 10,
  { maxLength, filterNode, ...options }: StringifyOptions = {}
): string {
  const MAX_LENGTH = maxLength ?? 10000
  let result

  // Convert string selector to filter function
  const filterFn =
    typeof filterNode === 'string'
      ? createNodeFilterFromSelector(filterNode)
      : filterNode

  const plugins = filterFn
    ? [
        ReactTestComponent,
        ReactElement,
        createDOMElementFilter(filterFn),
        DOMCollection,
        Immutable,
        AsymmetricMatcher,
      ]
    : PLUGINS

  try {
    result = prettyFormat(object, {
      maxDepth,
      escapeString: false,
      // min: true,
      plugins,
      ...options,
    })
  } catch {
    result = prettyFormat(object, {
      callToJSON: false,
      maxDepth,
      escapeString: false,
      // min: true,
      plugins,
      ...options,
    })
  }

  // Prevents infinite loop https://github.com/vitest-dev/vitest/issues/7249
  return result.length >= MAX_LENGTH && maxDepth > 1
    ? stringify(
        object,
        Math.floor(Math.min(maxDepth, Number.MAX_SAFE_INTEGER) / 2),
        {
          maxLength,
          filterNode,
          ...options,
        }
      )
    : result
}

function createNodeFilterFromSelector(
  selector: string
): (node: any) => boolean {
  const ELEMENT_NODE = 1
  const COMMENT_NODE = 8

  return (node: any) => {
    // Filter out comments
    if (node.nodeType === COMMENT_NODE) {
      return false
    }

    // Filter out elements matching the selector
    if (node.nodeType === ELEMENT_NODE && node.matches) {
      try {
        return !node.matches(selector)
      } catch {
        return true
      }
    }

    return true
  }
}

export const formatRegExp: RegExp = /%[sdjifoOc%]/g

export function format(args: unknown[], options: InspectOptions = {}): string {
  const formatArg = (item: unknown) => inspect(item, options)

  if (typeof args[0] !== 'string') {
    const objects = []
    for (let i = 0; i < args.length; i++) {
      objects.push(formatArg(args[i]))
    }
    return objects.join(' ')
  }

  const len = args.length
  let i = 1
  const template = args[0]
  let str = String(template).replace(formatRegExp, (x) => {
    if (x === '%%') {
      return '%'
    }
    if (i >= len) {
      return x
    }
    switch (x) {
      case '%s': {
        const value = args[i++]
        if (typeof value === 'bigint') {
          return `${value.toString()}n`
        }
        if (typeof value === 'number' && value === 0 && 1 / value < 0) {
          return '-0'
        }
        if (typeof value === 'object' && value !== null) {
          if (
            typeof value.toString === 'function' &&
            value.toString !== Object.prototype.toString
          ) {
            return value.toString()
          }
          return formatArg(value)
        }
        return String(value)
      }
      case '%d': {
        const value = args[i++]
        if (typeof value === 'bigint') {
          return `${value.toString()}n`
        }
        if (typeof value === 'symbol') {
          return 'NaN'
        }
        return Number(value).toString()
      }
      case '%i': {
        const value = args[i++]
        if (typeof value === 'bigint') {
          return `${value.toString()}n`
        }
        return Number.parseInt(String(value)).toString()
      }
      case '%f':
        return Number.parseFloat(String(args[i++])).toString()
      case '%o':
      case '%O':
        return formatArg(args[i++])
      case '%c': {
        i++
        return ''
      }
      case '%j':
        try {
          return JSON.stringify(args[i++])
        } catch (err: any) {
          const m = err.message
          if (
            // chromium
            m.includes('circular structure') ||
            // safari
            m.includes('cyclic structures') ||
            // firefox
            m.includes('cyclic object')
          ) {
            return '[Circular]'
          }
          throw err
        }
      default:
        return x
    }
  })

  for (let x = args[i]; i < len; x = args[++i]) {
    if (x === null || typeof x !== 'object') {
      str += ` ${typeof x === 'symbol' ? x.toString() : x}`
    } else {
      str += ` ${formatArg(x)}`
    }
  }
  return str
}

export interface InspectOptions extends StringifyOptions {
  truncate?: number
  multiline?: boolean
}

export function inspect(obj: unknown, options?: InspectOptions): string {
  const { truncate, multiline, ...stringifyOptions } = options ?? {}
  const prettyFormatOptions: PrettyFormatOptions = {
    singleQuote: true,
    quoteKeys: false,
    min: true,
    spacingInner: ' ',
    spacingOuter: ' ',
    printBasicPrototype: false,
    compareKeys: null,
    ...(multiline
      ? { min: false, spacingInner: undefined, spacingOuter: undefined }
      : {}),
  }
  const threshold = truncate ?? 0
  const formatted = stringify(obj, undefined, {
    ...prettyFormatOptions,
    ...stringifyOptions,
    maxLength: threshold || undefined,
  })

  if (threshold === 0 || formatted.length <= threshold) {
    return formatted
  }

  // if stringify's adaptive maxDepth (down to 1) fails to truncate enough,
  // - for known types (e.g. string, object, array, etc), apply best effort truncation.
  // - for other values, fallback to maxDepth = 0 which should can show minimal output.

  const type = Object.prototype.toString.call(obj)
  if (typeof obj === 'string') {
    let end = threshold - 1
    if (end > 0 && isHighSurrogate(formatted[end - 1])) {
      end = end - 1
    }
    return `'${formatted.slice(1, end)}…'`
  }
  if (
    type === '[object Array]' ||
    type === '[object Object]' ||
    type === '[object Set]' ||
    type === '[object Map]'
  ) {
    return stringifyByMaxWidth(obj, threshold, {
      ...prettyFormatOptions,
      ...stringifyOptions,
      maxDepth: 1,
    })
  }

  return stringify(obj, undefined, {
    ...prettyFormatOptions,
    ...stringifyOptions,
    maxDepth: 0,
  })
}

export function truncateString(string: string, maxLength: number): string {
  if (string.length <= maxLength) {
    return string
  }
  let end = maxLength - 1
  if (isHighSurrogate(string[end - 1])) {
    end = end - 1
  }
  return `${string.slice(0, end)}…`
}

function stringifyByMaxWidth(
  object: unknown,
  threshold: number,
  options: StringifyOptions
): string {
  function evaluate(x: number) {
    return stringify(object, undefined, {
      ...options,
      maxWidth: x,
    })
  }
  const opt = binarySearch(0, threshold, (x) => evaluate(x).length <= threshold)
  return evaluate(opt)
}

// find max(x \in [x, y) | f(x) = true)
// if f(x0) is false, then returns x0.
function binarySearch(
  x0: number,
  x1: number,
  f: (x: number) => boolean
): number {
  while (x0 + 1 < x1) {
    const x = Math.floor((x0 + x1) / 2)
    if (f(x)) {
      x0 = x
    } else {
      x1 = x
    }
  }
  return x0
}

// https://github.com/chaijs/loupe/pull/79
function isHighSurrogate(char: string): boolean {
  return char >= '\uD800' && char <= '\uDBFF'
}
