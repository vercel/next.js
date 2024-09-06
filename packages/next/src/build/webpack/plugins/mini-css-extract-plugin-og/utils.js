const NativeModule = require('module')
const path = require('path')

/** @typedef {import("webpack").Compilation} Compilation */
/** @typedef {import("webpack").Module} Module */
/** @typedef {import("webpack").LoaderContext<any>} LoaderContext */

/**
 * @returns {boolean}
 */
function trueFn() {
  return true
}

/**
 * @param {Compilation} compilation
 * @param {string | number} id
 * @returns {null | Module}
 */
function findModuleById(compilation, id) {
  const { modules, chunkGraph } = compilation

  for (const module of modules) {
    const moduleId =
      typeof chunkGraph !== 'undefined'
        ? chunkGraph.getModuleId(module)
        : module.id

    if (moduleId === id) {
      return module
    }
  }

  return null
}

/**
 * @param {LoaderContext} loaderContext
 * @param {string | Buffer} code
 * @param {string} filename
 * @returns {object}
 */
function evalModuleCode(loaderContext, code, filename) {
  // @ts-ignore
  const module = new NativeModule(filename, loaderContext)

  // @ts-ignore
  module.paths = NativeModule._nodeModulePaths(loaderContext.context) // eslint-disable-line no-underscore-dangle
  module.filename = filename
  // @ts-ignore
  module._compile(code, filename) // eslint-disable-line no-underscore-dangle

  return module.exports
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {0 | 1 | -1}
 */
function compareIds(a, b) {
  if (typeof a !== typeof b) {
    return typeof a < typeof b ? -1 : 1
  }

  if (a < b) {
    return -1
  }

  if (a > b) {
    return 1
  }

  return 0
}

/**
 * @param {Module} a
 * @param {Module} b
 * @returns {0 | 1 | -1}
 */
function compareModulesByIdentifier(a, b) {
  return compareIds(a.identifier(), b.identifier())
}

const MODULE_TYPE = 'css/mini-extract'
const AUTO_PUBLIC_PATH = '__mini_css_extract_plugin_public_path_auto__'
const ABSOLUTE_PUBLIC_PATH = 'webpack:///mini-css-extract-plugin/'
const BASE_URI = 'webpack://'
const SINGLE_DOT_PATH_SEGMENT =
  '__mini_css_extract_plugin_single_dot_path_segment__'

/**
 * @param {string} str
 * @returns {boolean}
 */
function isAbsolutePath(str) {
  return path.posix.isAbsolute(str) || path.win32.isAbsolute(str)
}

const RELATIVE_PATH_REGEXP = /^\.\.?[/\\]/

/**
 * @param {string} str
 * @returns {boolean}
 */
function isRelativePath(str) {
  return RELATIVE_PATH_REGEXP.test(str)
}

// TODO simplify for the next major release
/**
 * @param {LoaderContext} loaderContext
 * @param {string} request
 * @returns {string}
 */
function stringifyRequest(loaderContext, request) {
  if (
    typeof loaderContext.utils !== 'undefined' &&
    typeof loaderContext.utils.contextify === 'function'
  ) {
    return JSON.stringify(
      loaderContext.utils.contextify(
        loaderContext.context || loaderContext.rootContext,
        request
      )
    )
  }

  const splitted = request.split('!')
  const { context } = loaderContext

  return JSON.stringify(
    splitted
      .map((part) => {
        // First, separate singlePath from query, because the query might contain paths again
        const splittedPart = part.match(/^(.*?)(\?.*)/)
        const query = splittedPart ? splittedPart[2] : ''
        let singlePath = splittedPart ? splittedPart[1] : part

        if (isAbsolutePath(singlePath) && context) {
          singlePath = path.relative(context, singlePath)

          if (isAbsolutePath(singlePath)) {
            // If singlePath still matches an absolute path, singlePath was on a different drive than context.
            // In this case, we leave the path platform-specific without replacing any separators.
            // @see https://github.com/webpack/loader-utils/pull/14
            return singlePath + query
          }

          if (isRelativePath(singlePath) === false) {
            // Ensure that the relative path starts at least with ./ otherwise it would be a request into the modules directory (like node_modules).
            singlePath = `./${singlePath}`
          }
        }

        return singlePath.replace(/\\/g, '/') + query
      })
      .join('!')
  )
}

/**
 * @param {string} filename
 * @param {string} outputPath
 * @param {boolean} enforceRelative
 * @returns {string}
 */
function getUndoPath(filename, outputPath, enforceRelative) {
  let depth = -1
  let append = ''

  // eslint-disable-next-line no-param-reassign
  outputPath = outputPath.replace(/[\\/]$/, '')

  for (const part of filename.split(/[/\\]+/)) {
    if (part === '..') {
      if (depth > -1) {
        // eslint-disable-next-line no-plusplus
        depth--
      } else {
        const i = outputPath.lastIndexOf('/')
        const j = outputPath.lastIndexOf('\\')
        const pos = i < 0 ? j : j < 0 ? i : Math.max(i, j)

        if (pos < 0) {
          return `${outputPath}/`
        }

        append = `${outputPath.slice(pos + 1)}/${append}`

        // eslint-disable-next-line no-param-reassign
        outputPath = outputPath.slice(0, pos)
      }
    } else if (part !== '.') {
      // eslint-disable-next-line no-plusplus
      depth++
    }
  }

  return depth > 0
    ? `${'../'.repeat(depth)}${append}`
    : enforceRelative
      ? `./${append}`
      : append
}

/**
 *
 * @param {string | function} value
 * @returns {string}
 */
function stringifyLocal(value) {
  return typeof value === 'function' ? value.toString() : JSON.stringify(value)
}

/**
 * @param {string} str string
 * @returns {string} string
 */
const toSimpleString = (str) => {
  if (`${+str}` === str) {
    return str
  }
  return JSON.stringify(str)
}

/**
 * @param {string} str string
 * @returns {string} quoted meta
 */
const quoteMeta = (str) => str.replace(/[-[\]\\/{}()*+?.^$|]/g, '\\$&')

/**
 * @param {Array<string>} items items
 * @returns {string} common prefix
 */
const getCommonPrefix = (items) => {
  let prefix = items[0]

  for (let i = 1; i < items.length; i++) {
    const item = items[i]
    for (let p = 0; p < prefix.length; p++) {
      if (item[p] !== prefix[p]) {
        prefix = prefix.slice(0, p)
        break
      }
    }
  }

  return prefix
}

/**
 * @param {Array<string>} items items
 * @returns {string} common suffix
 */
const getCommonSuffix = (items) => {
  let suffix = items[0]

  for (let i = 1; i < items.length; i++) {
    const item = items[i]
    for (let p = item.length - 1, s = suffix.length - 1; s >= 0; p--, s--) {
      if (item[p] !== suffix[s]) {
        suffix = suffix.slice(s + 1)
        break
      }
    }
  }

  return suffix
}

/**
 * @param {Set<string>} itemsSet items set
 * @param {(str: string) => string | false} getKey get key function
 * @param {(str: Array<string>) => boolean} condition condition
 * @returns {Array<Array<string>>} list of common items
 */
const popCommonItems = (itemsSet, getKey, condition) => {
  /** @type {Map<string, Array<string>>} */
  const map = new Map()

  for (const item of itemsSet) {
    const key = getKey(item)
    if (key) {
      let list = map.get(key)
      if (list === undefined) {
        /** @type {Array<string>} */
        list = []
        map.set(key, list)
      }
      list.push(item)
    }
  }

  /** @type {Array<Array<string>>} */
  const result = []

  for (const list of map.values()) {
    if (condition(list)) {
      for (const item of list) {
        itemsSet.delete(item)
      }
      result.push(list)
    }
  }

  return result
}

/**
 * @param {Array<string>} itemsArr array of items
 * @returns {string} regexp
 */
const itemsToRegexp = (itemsArr) => {
  if (itemsArr.length === 1) {
    return quoteMeta(itemsArr[0])
  }

  /** @type {Array<string>} */
  const finishedItems = []

  // merge single char items: (a|b|c|d|ef) => ([abcd]|ef)
  let countOfSingleCharItems = 0

  for (const item of itemsArr) {
    if (item.length === 1) {
      // eslint-disable-next-line no-plusplus
      countOfSingleCharItems++
    }
  }

  // special case for only single char items
  if (countOfSingleCharItems === itemsArr.length) {
    return `[${quoteMeta(itemsArr.sort().join(''))}]`
  }

  const items = new Set(itemsArr.sort())

  if (countOfSingleCharItems > 2) {
    let singleCharItems = ''
    for (const item of items) {
      if (item.length === 1) {
        singleCharItems += item
        items.delete(item)
      }
    }
    finishedItems.push(`[${quoteMeta(singleCharItems)}]`)
  }

  // special case for 2 items with common prefix/suffix
  if (finishedItems.length === 0 && items.size === 2) {
    const prefix = getCommonPrefix(itemsArr)
    const suffix = getCommonSuffix(
      itemsArr.map((item) => item.slice(prefix.length))
    )

    if (prefix.length > 0 || suffix.length > 0) {
      return `${quoteMeta(prefix)}${itemsToRegexp(
        itemsArr.map((i) => i.slice(prefix.length, -suffix.length || undefined))
      )}${quoteMeta(suffix)}`
    }
  }

  // special case for 2 items with common suffix
  if (finishedItems.length === 0 && items.size === 2) {
    /** @type {Iterator<string>} */
    const it = items[Symbol.iterator]()
    const a = it.next().value
    const b = it.next().value
    if (a.length > 0 && b.length > 0 && a.slice(-1) === b.slice(-1)) {
      return `${itemsToRegexp([a.slice(0, -1), b.slice(0, -1)])}${quoteMeta(
        a.slice(-1)
      )}`
    }
  }

  // find common prefix: (a1|a2|a3|a4|b5) => (a(1|2|3|4)|b5)
  const prefixed = popCommonItems(
    items,
    (item) => (item.length >= 1 ? item[0] : false),
    (list) => {
      if (list.length >= 3) return true
      if (list.length <= 1) return false
      return list[0][1] === list[1][1]
    }
  )
  for (const prefixedItems of prefixed) {
    const prefix = getCommonPrefix(prefixedItems)
    finishedItems.push(
      `${quoteMeta(prefix)}${itemsToRegexp(
        prefixedItems.map((i) => i.slice(prefix.length))
      )}`
    )
  }

  // find common suffix: (a1|b1|c1|d1|e2) => ((a|b|c|d)1|e2)
  const suffixed = popCommonItems(
    items,
    (item) => (item.length >= 1 ? item.slice(-1) : false),
    (list) => {
      if (list.length >= 3) return true
      if (list.length <= 1) return false
      return list[0].slice(-2) === list[1].slice(-2)
    }
  )
  for (const suffixedItems of suffixed) {
    const suffix = getCommonSuffix(suffixedItems)
    finishedItems.push(
      `${itemsToRegexp(
        suffixedItems.map((i) => i.slice(0, -suffix.length))
      )}${quoteMeta(suffix)}`
    )
  }

  // TODO further optimize regexp, i. e.
  // use ranges: (1|2|3|4|a) => [1-4a]
  const conditional = finishedItems.concat(Array.from(items, quoteMeta))
  if (conditional.length === 1) return conditional[0]
  return `(${conditional.join('|')})`
}

/**
 * @param {string[]} positiveItems positive items
 * @param {string[]} negativeItems negative items
 * @returns {function(string): string} a template function to determine the value at runtime
 */
const compileBooleanMatcherFromLists = (positiveItems, negativeItems) => {
  if (positiveItems.length === 0) {
    return () => 'false'
  }

  if (negativeItems.length === 0) {
    return () => 'true'
  }

  if (positiveItems.length === 1) {
    return (value) => `${toSimpleString(positiveItems[0])} == ${value}`
  }

  if (negativeItems.length === 1) {
    return (value) => `${toSimpleString(negativeItems[0])} != ${value}`
  }

  const positiveRegexp = itemsToRegexp(positiveItems)
  const negativeRegexp = itemsToRegexp(negativeItems)

  if (positiveRegexp.length <= negativeRegexp.length) {
    return (value) => `/^${positiveRegexp}$/.test(${value})`
  }

  return (value) => `!/^${negativeRegexp}$/.test(${value})`
}

// TODO simplify in the next major release and use it from webpack
/**
 * @param {Record<string|number, boolean>} map value map
 * @returns {boolean|(function(string): string)} true/false, when unconditionally true/false, or a template function to determine the value at runtime
 */
const compileBooleanMatcher = (map) => {
  const positiveItems = Object.keys(map).filter((i) => map[i])
  const negativeItems = Object.keys(map).filter((i) => !map[i])

  if (positiveItems.length === 0) {
    return false
  }

  if (negativeItems.length === 0) {
    return true
  }

  return compileBooleanMatcherFromLists(positiveItems, negativeItems)
}

module.exports = {
  trueFn,
  findModuleById,
  evalModuleCode,
  compareModulesByIdentifier,
  MODULE_TYPE,
  AUTO_PUBLIC_PATH,
  ABSOLUTE_PUBLIC_PATH,
  BASE_URI,
  SINGLE_DOT_PATH_SEGMENT,
  stringifyRequest,
  stringifyLocal,
  getUndoPath,
  compileBooleanMatcher,
}
