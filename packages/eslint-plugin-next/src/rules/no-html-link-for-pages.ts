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

const DEFAULT_PAGE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx']

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

/**
 * Attempt to read pageExtensions from next.config.js in the given root directories.
 * Returns null if the config cannot be loaded or does not specify pageExtensions.
 */
function readPageExtensionsFromConfig(rootDirs: string[]): string[] | null {
  for (const rootDir of rootDirs) {
    for (const configFile of ['next.config.js', 'next.config.cjs']) {
      const configPath = path.join(rootDir, configFile)
      try {
        if (fs.existsSync(configPath)) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const config = require(configPath)
          const resolved = config?.default ?? config
          if (Array.isArray(resolved?.pageExtensions)) {
            return resolved.pageExtensions
          }
        }
      } catch {
        // Ignore: config may use ESM, have syntax errors, or side effects
      }
    }
  }
  return null
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
      {
        type: 'object',
        properties: {
          pageExtensions: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  /**
   * Creates an ESLint rule listener.
   */
  create(context) {
    const ruleOptions: (string | string[] | { pageExtensions?: string[] })[] =
      context.options
    const [customPagesDirectory, secondOption] = ruleOptions

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

    // Resolve pageExtensions: rule option > next.config.js > default
    const pageExtensions: string[] =
      (secondOption as { pageExtensions?: string[] })?.pageExtensions ??
      readPageExtensionsFromConfig(rootDirs) ??
      DEFAULT_PAGE_EXTENSIONS

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