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

// Default page extensions used when next.config.js cannot be read
const DEFAULT_PAGE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs']

/**
 * Attempts to read pageExtensions from next.config.js at the given rootDir.
 * Returns undefined if the config cannot be read or parsed.
 */
function getPageExtensionsFromConfig(rootDir: string): string[] | undefined {
  try {
    const configPath = path.join(rootDir, 'next.config.js')
    if (!fs.existsSync(configPath)) {
      return undefined
    }
    const configContent = fs.readFileSync(configPath, 'utf8')
    // Match pageExtensions assignment: pageExtensions: ['js', 'ts', ...]
    const match = configContent.match(/pageExtensions\s*:\s*\[([^\]]+)\]/)
    if (!match) {
      return undefined
    }
    const extensionsStr = match[1]
    // Extract quoted strings
    const extensions = [...extensionsStr.matchAll(/['"]([^'"]+)['"]/g)].map(
      (m) => m[1]
    )
    return extensions.length > 0 ? extensions : undefined
  } catch {
    return undefined
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
        type: 'array',
        uniqueItems: true,
        items: {
          type: 'string',
        },
      },
    ],
  },

  /**
   * Creates an ESLint rule listener.
   */
  create(context) {
    const ruleOptions = context.options as [
      (string | string[])?,
      string[]?,
      ...unknown[],
    ]
    const [customPagesDirectory, customPageExtensions] = ruleOptions

    const rootDirs = getRootDirs(context)

    // customPagesDirectory can be a string or string[] (array of dirs)
    const customDirs: string[] = customPagesDirectory
      ? Array.isArray(customPagesDirectory)
        ? customPagesDirectory
        : [customPagesDirectory]
      : []

    const pagesDirs =
      customDirs.length > 0
        ? customDirs
        : rootDirs.flatMap((dir) => [
            path.join(dir, 'pages'),
            path.join(dir, 'src', 'pages'),
          ])

    const foundPagesDirs = pagesDirs.filter((dir: string) => {
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

    // Resolve page extensions: user-provided > next.config.js > default
    let pageExtensions: string[]
    if (
      customPageExtensions &&
      Array.isArray(customPageExtensions) &&
      customPageExtensions.length > 0
    ) {
      pageExtensions = customPageExtensions as string[]
    } else {
      // Try to read from next.config.js
      const configExtensions = getPageExtensionsFromConfig(rootDirs[0])
      pageExtensions = configExtensions ?? DEFAULT_PAGE_EXTENSIONS
    }

    const pageUrls = cachedGetUrlFromPagesDirectories(
      '/',
      foundPagesDirs,
      pageExtensions
    )
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
