import * as path from 'path'
import * as fs from 'fs'
import type { Rule } from 'eslint'

const DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js']

// Cache for config lookup to avoid repeated file system reads
const configCache = new Map<string, string[]>()

/**
 * Gets pageExtensions from next.config.js or returns defaults.
 * This function tries to read the config synchronously for ESLint compatibility.
 */
export function getPageExtensions(
  context: Rule.RuleContext,
  rootDirs: string[]
): string[] {
  // Check if pageExtensions is provided in ESLint settings
  const nextSettings: { pageExtensions?: string[] } =
    context.settings.next || {}
  if (
    nextSettings.pageExtensions &&
    Array.isArray(nextSettings.pageExtensions)
  ) {
    return nextSettings.pageExtensions
  }

  // Try to read from next.config.js in each root directory
  for (const rootDir of rootDirs) {
    const cacheKey = rootDir
    if (configCache.has(cacheKey)) {
      const cached = configCache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const configFiles = ['next.config.js', 'next.config.mjs', 'next.config.cjs']

    for (const configFile of configFiles) {
      const configPath = path.join(rootDir, configFile)
      if (fs.existsSync(configPath)) {
        try {
          // For .mjs files, we can't use require, so we'll skip them
          // and fall back to defaults. Users can provide pageExtensions
          // via ESLint settings if needed.
          if (configFile.endsWith('.mjs')) {
            continue
          }

          // Clear require cache if it exists
          try {
            const resolvedPath = require.resolve(configPath)
            if (require.cache[resolvedPath]) {
              delete require.cache[resolvedPath]
            }
          } catch {
            // Path not in cache yet, that's fine
          }
          const config = require(configPath)

          // Handle both default export and module.exports
          const userConfig = config.default || config

          if (
            userConfig &&
            typeof userConfig === 'object' &&
            Array.isArray(userConfig.pageExtensions)
          ) {
            const pageExtensions = userConfig.pageExtensions
            configCache.set(cacheKey, pageExtensions)
            return pageExtensions
          }
        } catch (err) {
          // If config loading fails, continue to next root dir or fall back to defaults
          // This can happen if the config has dependencies that aren't available in ESLint context
        }
      }
    }
  }

  // Return defaults if no config found
  return DEFAULT_PAGE_EXTENSIONS
}
