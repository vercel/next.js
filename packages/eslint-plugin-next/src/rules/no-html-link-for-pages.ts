import { defineRule } from '../utils/define-rule'
import * as path from 'path'
import * as fs from 'fs'
import { getRootDirs } from '../utils/get-root-dirs'

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
        type: 'object',
        properties: {
          pageExtensions: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
          customPagesDirectory: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    // Read options from ESLint config
    const ruleOptions: any = context.options[0] || {}
    const pageExtensions =
      typeof ruleOptions === 'object' && ruleOptions !== null
        ? ruleOptions.pageExtensions || ['js', 'jsx', 'ts', 'tsx']
        : ['js', 'jsx', 'ts', 'tsx']
    const customPagesDirectory =
      typeof ruleOptions === 'string'
        ? ruleOptions
        : typeof ruleOptions === 'object' && ruleOptions !== null
          ? ruleOptions.customPagesDirectory
          : undefined

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

    if (foundPagesDirs.length === 0 && foundAppDirs.length === 0) {
      pagesDirWarning(pagesDirs)
      return {}
    }

    // Pass pageExtensions into URL builders
    const pageUrls = cachedGetUrlFromPagesDirectories('/', foundPagesDirs, pageExtensions)
    const appDirUrls = cachedGetUrlFromAppDirectory('/', foundAppDirs, pageExtensions)
    const allUrlRegex = [...pageUrls, ...appDirUrls]

    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'a') return
        if (node.attributes.length === 0) return

        const target = node.attributes.find(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'target'
        )
        if (target && target.value.value === '_blank') return

        const href = node.attributes.find(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'href'
        )
        if (!href || (href.value && href.value.type !== 'Literal')) return

        const hasDownloadAttr = node.attributes.find(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'download'
        )
        if (hasDownloadAttr) return

        const hrefPath = normalizeURL(href.value.value)
        if (/^(https?:\/\/|\/\/)/.test(hrefPath)) return

        allUrlRegex.forEach((foundUrl) => {
          if (foundUrl.test(normalizeURL(hrefPath))) {
            context.report({
              node,
              message: `Do not use an \`<a>\` element to navigate to \`${hrefPath}\`. Use \`<Link />\` from \`next/link\` instead. See: ${url}`,
            })
          }
        })
      },
    }
  },
})
