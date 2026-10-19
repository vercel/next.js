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

const cachedGetUrlFromPagesDirectories = memoize(getUrlFromPagesDirectories)
const cachedGetUrlFromAppDirectory = memoize(getUrlFromAppDirectory)

/**
 * Attempts to read pageExtensions from next.config.js
 */
function getPageExtensions(rootDirs: string[]): string[] {
  const DEFAULT_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js']
  
  for (const rootDir of rootDirs) {
    const configPaths = [
      path.join(rootDir, 'next.config.js'),
      path.join(rootDir, 'next.config.mjs'),
      path.join(rootDir, 'next.config.ts'),
    ]
    
    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, 'utf8')
          
          // Try to extract pageExtensions from the config file
          // This is a simple regex-based approach that works for most cases
          const pageExtensionsMatch = configContent.match(
            /pageExtensions\s*:\s*\[([^\]]+)\]/
          )
          
          if (pageExtensionsMatch) {
            const extensionsStr = pageExtensionsMatch[1]
            const extensions = extensionsStr
              .split(',')
              .map((ext) => ext.trim().replace(/['"]/g, ''))
              .filter(Boolean)
            
            if (extensions.length > 0) {
              return extensions
            }
          }
        }
      } catch (error) {
        // If we can't read the config, fall back to defaults
        continue
      }
    }
  }
  
  return DEFAULT_EXTENSIONS
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
    const pageExtensions = getPageExtensions(rootDirs)

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

    const pageUrls = cachedGetUrlFromPagesDirectories('/', foundPagesDirs, pageExtensions)
    const appDirUrls = cachedGetUrlFromAppDirectory('/', foundAppDirs, pageExtensions)
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
