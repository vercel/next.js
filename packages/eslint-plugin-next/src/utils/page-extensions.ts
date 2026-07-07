import * as path from 'path'
import * as fs from 'fs'
import type { Rule } from 'eslint'
import { getRootDirs } from './get-root-dirs'

/**
 * Default Next.js page extensions
 */
const DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js']

/**
 * Cache for page extensions to avoid repeated file reads
 */
const pageExtensionsCache: Map<string, string[]> = new Map()

/**
 * Gets page extensions from Next.js config or returns defaults
 */
export function getPageExtensions(context: Rule.RuleContext): string[] {
  // Check if page extensions are provided in ESLint settings
  const nextSettings: { pageExtensions?: string[] } =
    context.settings.next || {}

  if (
    nextSettings.pageExtensions &&
    Array.isArray(nextSettings.pageExtensions)
  ) {
    return nextSettings.pageExtensions
  }

  // Try to read from next.config files
  const rootDirs = getRootDirs(context)

  for (const rootDir of rootDirs) {
    const cacheKey = rootDir
    if (pageExtensionsCache.has(cacheKey)) {
      return pageExtensionsCache.get(cacheKey)!
    }

    const extensions = tryReadNextConfig(rootDir)
    if (extensions) {
      pageExtensionsCache.set(cacheKey, extensions)
      return extensions
    }
  }

  return DEFAULT_PAGE_EXTENSIONS
}

/**
 * Attempts to read pageExtensions from next.config.* files
 */
function tryReadNextConfig(rootDir: string): string[] | null {
  const configFiles = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'next.config.mts',
  ]

  for (const configFile of configFiles) {
    const configPath = path.join(rootDir, configFile)

    if (!fs.existsSync(configPath)) {
      continue
    }

    try {
      const content = fs.readFileSync(configPath, 'utf8')

      // Simple regex-based extraction — not perfect but works for most cases
      // Looks for: pageExtensions: ['tsx', 'ts', ...] or pageExtensions:['tsx','ts',...]
      const match = content.match(
        /pageExtensions\s*:\s*\[\s*([^\]]+)\s*\]/
      )

      if (match) {
        // Extract quoted strings from the array
        const extensionsStr = match[1]
        const extensions = extensionsStr
          .match(/['"`]([^'"`]+)['"`]/g)
          ?.map((ext) => ext.replace(/['"`]/g, ''))
          .filter(Boolean)

        if (extensions && extensions.length > 0) {
          return extensions
        }
      }
    } catch (error) {
      // If we can't read or parse the config, just continue
      continue
    }
  }

  return null
}

/**
 * Builds a regex pattern from page extensions
 * Example: ['tsx', 'ts', 'jsx', 'js'] => /\.(tsx|ts|jsx|js)$/
 */
export function buildPageExtensionRegex(extensions: string[]): RegExp {
  // Escape special regex characters in extensions
  const escapedExtensions = extensions.map((ext) =>
    ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  return new RegExp(`\\.(${escapedExtensions.join('|')})$`)
}

