import * as path from 'path'
import * as fs from 'fs'
import type { Rule } from 'eslint'

// Default Next.js page extensions
export const DEFAULT_PAGE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx']

// Cache for page extensions lookup
const pageExtensionsCache: { [key: string]: string[] } = {}

/**
 * Gets the page extensions from the Next.js config file.
 * Looks for next.config.js, next.config.mjs, or next.config.ts in the root directory.
 */
export function getPageExtensions(context: Rule.RuleContext): string[] {
  const rootDir = context.cwd

  // Check cache first
  if (pageExtensionsCache[rootDir]) {
    return pageExtensionsCache[rootDir]
  }

  // Try to find next.config file
  const configFiles = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
  ]

  for (const configFile of configFiles) {
    const configPath = path.join(rootDir, configFile)
    if (fs.existsSync(configPath)) {
      try {
        // Clear require cache to ensure fresh config
        delete require.cache[require.resolve(configPath)]
        const config = require(configPath)
        const extensions =
          config.pageExtensions || config.default?.pageExtensions
        if (extensions && Array.isArray(extensions)) {
          pageExtensionsCache[rootDir] = extensions
          return extensions
        }
      } catch {
        // If we can't load the config, fall back to defaults
      }
    }
  }

  // Return default extensions if no config found or no pageExtensions specified
  pageExtensionsCache[rootDir] = DEFAULT_PAGE_EXTENSIONS
  return DEFAULT_PAGE_EXTENSIONS
}

/**
 * Creates a regex pattern for matching page file extensions.
 * For example: ['js', 'jsx', 'ts', 'tsx'] -> '\.(j|t)sx?$'
 * For custom extensions: ['page.tsx', 'page.ts'] -> '\.page\.(tsx?)$'
 */
export function getPageExtensionRegex(extensions: string[]): RegExp {
  if (extensions.length === 0) {
    return /\.(j|t)sx?$/
  }

  // Group extensions by their base pattern
  const simpleExtensions: string[] = []
  const complexExtensions: string[] = []

  for (const ext of extensions) {
    // Check if it's a simple extension (like 'js', 'tsx') or complex (like 'page.tsx')
    if (ext.includes('.')) {
      complexExtensions.push(ext)
    } else {
      simpleExtensions.push(ext)
    }
  }

  const patterns: string[] = []

  // Handle simple extensions (js, jsx, ts, tsx)
  if (simpleExtensions.length > 0) {
    // Group by first char to create pattern like (j|t)sx?
    const byFirstChar: { [key: string]: string[] } = {}
    for (const ext of simpleExtensions) {
      const firstChar = ext[0]
      if (!byFirstChar[firstChar]) {
        byFirstChar[firstChar] = []
      }
      byFirstChar[firstChar].push(ext)
    }

    const simplePattern = Object.entries(byFirstChar)
      .map(([firstChar, exts]) => {
        const restPatterns = exts.map((e) => e.slice(1))
        const uniqueRest = [...new Set(restPatterns)]
        if (uniqueRest.length === 1) {
          return `${firstChar}${uniqueRest[0]}`
        }
        return `${firstChar}(?:${uniqueRest.join('|')})`
      })
      .join('|')

    patterns.push(`\\.(${simplePattern})$`)
  }

  // Handle complex extensions (like page.tsx)
  for (const ext of complexExtensions) {
    // Escape dots in the extension
    const escaped = ext.replace(/\./g, '\\.')
    patterns.push(`\\.${escaped}$`)
  }

  if (patterns.length === 1) {
    return new RegExp(patterns[0])
  }

  return new RegExp(`(?:${patterns.join('|')})`)
}
