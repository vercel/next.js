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

const url = 'https://nextjs.org/docs/messages/no-html-link-for-pages'

function getPageExtensionsFromNextConfig(rootDirs: string[]): string[] | undefined {
  const configFiles = [
    'next.config.js',
    'next.config.mjs',
    'next.config.cjs',
    'next.config.ts',
    'next.config.mts',
    'next.config.cts',
  ]
  for (const dir of rootDirs) {
    for (const file of configFiles) {
      const fullPath = path.join(dir, file)
      if (!fs.existsSync(fullPath)) continue
      try {
        const content = fs.readFileSync(fullPath, 'utf8')
        const match = content.match(/pageExtensions\s*:\s*\[([^\]]+)\]/)
        if (match) {
          const inside = match[1]
          const exts: string[] = []
          const re = /['"]([^'"]+)['"]/g
          let m: RegExpExecArray | null
          while ((m = re.exec(inside)) !== null) {
            exts.push(m[1])
          }
          if (exts.length > 0) return exts
        }
      } catch {}
    }
  }
  return undefined
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
          {
            type: 'object',
            properties: {
              pageExtensions: {
                type: 'array',
                items: { type: 'string' },
                uniqueItems: true,
              },
              pagesDir: {
                oneOf: [
                  { type: 'string' },
                  {
                    type: 'array',
                    uniqueItems: true,
                    items: { type: 'string' },
                  },
                ],
              },
            },
            additionalProperties: false,
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
    let customPagesDirectory: string | string[] | undefined
    let pageExtensions: string[] | undefined

    const firstOpt: any = context.options[0]
    const secondOpt: any = context.options[1]

    if (
      firstOpt &&
      typeof firstOpt === 'object' &&
      !Array.isArray(firstOpt)
    ) {
      if (firstOpt.pagesDir) customPagesDirectory = firstOpt.pagesDir
      if (Array.isArray(firstOpt.pageExtensions))
        pageExtensions = firstOpt.pageExtensions
    } else if (typeof firstOpt === 'string' || Array.isArray(firstOpt)) {
      customPagesDirectory = firstOpt
      if (secondOpt) {
        if (
          Array.isArray(secondOpt) &&
          secondOpt.every((v: any) => typeof v === 'string')
        ) {
          pageExtensions = secondOpt
        } else if (
          secondOpt &&
          typeof secondOpt === 'object' &&
          Array.isArray(secondOpt.pageExtensions)
        ) {
          pageExtensions = secondOpt.pageExtensions
          if (!customPagesDirectory && secondOpt.pagesDir)
            customPagesDirectory = secondOpt.pagesDir
        }
      }
    } else if (
      secondOpt &&
      typeof secondOpt === 'object' &&
      Array.isArray(secondOpt.pageExtensions)
    ) {
      pageExtensions = secondOpt.pageExtensions
    }

    // check settings.next.pageExtensions
    if (!pageExtensions) {
      const nextSettings: any = (context.settings as any).next || {}
      if (Array.isArray(nextSettings.pageExtensions)) {
        pageExtensions = nextSettings.pageExtensions
      }
    }

    const rootDirs = getRootDirs(context)

    if (!pageExtensions) {
      pageExtensions = getPageExtensionsFromNextConfig(rootDirs)
    }

    pageExtensions = pageExtensions || ['tsx', 'ts', 'jsx', 'js']

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
