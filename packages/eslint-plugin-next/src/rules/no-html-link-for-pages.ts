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
// Prevent multiple blocking IO requests that have already been calculated.
const fsExistsSyncCache = {}
const defaultPageExtensions = ['tsx', 'ts', 'jsx', 'js']

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

const getPageExtensionsForRootDir = (rootDir: string) => {
  for (const configFile of ['next.config.js', 'next.config.cjs']) {
    const configPath = path.join(rootDir, configFile)
    if (!fs.existsSync(configPath)) {
      continue
    }

    try {
      const loadedConfig = require(configPath)
      const nextConfig = loadedConfig?.default ?? loadedConfig
      const customPageExtensions = nextConfig?.pageExtensions

      if (Array.isArray(customPageExtensions)) {
        return customPageExtensions.filter(
          (extension): extension is string =>
            typeof extension === 'string' && extension.length > 0
        )
      }
    } catch {
      continue
    }
  }

  return defaultPageExtensions
}

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
    const pageExtensions = Array.from(
      new Set(rootDirs.flatMap((rootDir) => getPageExtensionsForRootDir(rootDir)))
    )

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

    const pageUrls = cachedGetUrlFromPagesDirectories(
      '/',
      foundPagesDirs,
      pageExtensions
    )
    const appDirUrls = cachedGetUrlFromAppDirectory(
      '/',
      foundAppDirs,
      pageExtensions
    )
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

        if (target && target.value.value === '_blank') {
          return
        }

        const href = node.attributes.find(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'href'
        )

        if (!href || (href.value && href.value.type !== 'Literal')) {
          return
        }

        const hasDownloadAttr = node.attributes.find(
          (attr) =>
            attr.type === 'JSXAttribute' && attr.name.name === 'download'
        )

        if (hasDownloadAttr) {
          return
        }

        const hrefPath = normalizeURL(href.value.value)
        // Outgoing links are ignored
        if (/^(https?:\/\/|\/\/)/.test(hrefPath)) {
          return
        }

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
