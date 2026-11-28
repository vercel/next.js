import { defineRule } from '../utils/define-rule'
import * as path from 'path'
import * as fs from 'fs'
import { getRootDirs } from '../utils/get-root-dirs'
import {
  findVariable,
  getPropertyName,
  getStaticValue,
} from '@eslint-community/eslint-utils'
import type { Rule, SourceCode } from 'eslint'

import {
  getUrlFromPagesDirectories,
  normalizeURL,
  execOnce,
  getUrlFromAppDirectory,
} from '../utils/url'

const pagesDirWarning = execOnce((pagesDirs) => {
  console.warn(
    `Pages directory cannot be found at ${pagesDirs.join(' or ')}. ` +
      'If using a custom path, please configure with the `no-html-link-for-pages` rule in your eslint config file.'
  )
})

// Cache for fs.existsSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsExistsSyncCache = {}

const memoize = <T = any>(fn: (...args: any[]) => T) => {
  const cache = {}
  return (...args: any[]): T => {
    const key = JSON.stringify(args)
    if (cache[key] === undefined) {
      cache[key] = fn(...args)
    }
    return cache[key]
  }
}

const cachedGetUrlFromPagesDirectories = memoize(getUrlFromPagesDirectories)
const cachedGetUrlFromAppDirectory = memoize(getUrlFromAppDirectory)

const url = 'https://nextjs.org/docs/messages/no-html-link-for-pages'

// Resolve direct constants first, then the first parameter of an inline map
// callback over a static array. Unknown values are left to runtime.
function getHrefValues(node: Rule.Node, sourceCode: SourceCode): unknown[] {
  const scope = sourceCode.getScope(node)
  const constant = getStaticValue(node, scope)
  if (constant) return [constant.value]

  const identifier = node.type === 'MemberExpression' ? node.object : node
  if (identifier.type !== 'Identifier') return []

  const variable = findVariable(scope, identifier)
  if (!variable || variable.defs.length !== 1) return []
  const definition = variable.defs[0]
  if (definition.type !== 'Parameter') return []

  const callback = definition.node as Rule.Node
  const call = callback.parent
  if (
    (callback.type !== 'ArrowFunctionExpression' &&
      callback.type !== 'FunctionExpression') ||
    callback.params[0] !== definition.name ||
    call.type !== 'CallExpression' ||
    call.arguments[0] !== callback ||
    call.callee.type !== 'MemberExpression' ||
    getPropertyName(call.callee, sourceCode.getScope(call)) !== 'map'
  ) {
    return []
  }

  // Do not infer values when the callback reassigns, mutates, or passes its
  // parameter to another function. Only direct reads in JSX are supported.
  if (
    variable.references.some((reference) => {
      if (!reference.isReadOnly()) return true
      const parent = (reference.identifier as Rule.Node).parent
      const container: { type: string } =
        parent.type === 'MemberExpression' &&
        parent.object === reference.identifier
          ? parent.parent
          : parent
      return container.type !== 'JSXExpressionContainer'
    })
  ) {
    return []
  }

  const array = getStaticValue(call.callee.object, sourceCode.getScope(call))
  if (!array || !Array.isArray(array.value)) return []

  if (node.type === 'Identifier') return array.value
  if (node.type !== 'MemberExpression') return []
  const property = getPropertyName(node, scope)
  if (property == null) return []

  return array.value.map((item) =>
    item != null && Object.prototype.hasOwnProperty.call(item, property)
      ? item[property]
      : undefined
  )
}

export default defineRule({
  meta: {
    docs: {
      description:
        'Prevent usage of `<a>` elements to navigate to internal Next.js pages.',
      category: 'HTML',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [
      {
        oneOf: [
          {
            type: 'string',
          },
          {
            type: 'array',
            uniqueItems: true,
            items: {
              type: 'string',
            },
          },
        ],
      },
    ],
  },

  /**
   * Creates an ESLint rule listener.
   */
  create(context) {
    const ruleOptions: (string | string[])[] = context.options
    const [customPagesDirectory] = ruleOptions

    const rootDirs = getRootDirs(context)

    const pagesDirs = (
      customPagesDirectory
        ? [customPagesDirectory]
        : rootDirs.map((dir) => [
            path.join(dir, 'pages'),
            path.join(dir, 'src', 'pages'),
          ])
    ).flat()

    const foundPagesDirs = pagesDirs.filter((dir) => {
      if (fsExistsSyncCache[dir] === undefined) {
        fsExistsSyncCache[dir] = fs.existsSync(dir)
      }
      return fsExistsSyncCache[dir]
    })

    const appDirs = rootDirs
      .map((dir) => [path.join(dir, 'app'), path.join(dir, 'src', 'app')])
      .flat()

    const foundAppDirs = appDirs.filter((dir) => {
      if (fsExistsSyncCache[dir] === undefined) {
        fsExistsSyncCache[dir] = fs.existsSync(dir)
      }
      return fsExistsSyncCache[dir]
    })

    // warn if there are no pages and app directories
    if (foundPagesDirs.length === 0 && foundAppDirs.length === 0) {
      pagesDirWarning(pagesDirs)
      return {}
    }

    const pageUrls = cachedGetUrlFromPagesDirectories('/', foundPagesDirs)
    const appDirUrls = cachedGetUrlFromAppDirectory('/', foundAppDirs)
    const allUrlRegex = [...pageUrls, ...appDirUrls]

    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'a') {
          return
        }

        if (node.attributes.length === 0) {
          return
        }

        const target = node.attributes.find(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'target'
        )

        if (
          target?.value &&
          (target.value.type === 'Literal'
            ? target.value.value === '_blank'
            : target.value.type === 'JSXExpressionContainer' &&
              getStaticValue(
                target.value.expression,
                context.sourceCode.getScope(node)
              )?.value === '_blank')
        ) {
          return
        }

        const href = node.attributes.find(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'href'
        )

        if (!href?.value) {
          return
        }

        const hasDownloadAttr = node.attributes.find(
          (attr) =>
            attr.type === 'JSXAttribute' && attr.name.name === 'download'
        )

        if (hasDownloadAttr) {
          return
        }

        const expression =
          href.value.type === 'JSXExpressionContainer'
            ? href.value.expression
            : href.value
        const hrefPaths = getHrefValues(expression, context.sourceCode)
        for (const value of hrefPaths) {
          if (typeof value !== 'string') continue
          const hrefPath = normalizeURL(value)
          // Outgoing links are ignored.
          if (/^(https?:\/\/|\/\/)/.test(hrefPath)) continue

          if (allUrlRegex.some((foundUrl) => foundUrl.test(hrefPath))) {
            context.report({
              node,
              message: `Do not use an \`<a>\` element to navigate to \`${hrefPath}\`. Use \`<Link />\` from \`next/link\` instead. See: ${url}`,
            })
            // A mapped anchor can have several internal destinations.
            // Report the element once, using the first matching destination.
            break
          }
        }
      },
    }
  },
})
