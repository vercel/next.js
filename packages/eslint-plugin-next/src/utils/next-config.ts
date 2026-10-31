import * as fs from 'fs'
import * as path from 'path'

const nextConfigCache = new Map<string, { pageExtensions: string[] }>()

/**
 * Reads the Next.js config file and returns the pageExtensions setting.
 * Returns the default extensions if the config doesn't exist or doesn't specify pageExtensions.
 */
export function getPageExtensions(rootDir: string): string[] {
  if (nextConfigCache.has(rootDir)) {
    return nextConfigCache.get(rootDir)!.pageExtensions
  }

  const defaultExtensions = ['.js', '.jsx', '.ts', '.tsx']

  // Check for next.config.js, next.config.ts, next.config.mjs
  const configFiles = [
    'next.config.js',
    'next.config.ts',
    'next.config.mjs',
    'next.config.cjs',
  ]

  let configPath: string | null = null
  for (const configFile of configFiles) {
    const fullPath = path.join(rootDir, configFile)
    if (fs.existsSync(fullPath)) {
      configPath = fullPath
      break
    }
  }

  if (!configPath) {
    nextConfigCache.set(rootDir, { pageExtensions: defaultExtensions })
    return defaultExtensions
  }

  try {
    // For .js, .mjs, .cjs files, we can require them
    // For .ts files, we need to handle them differently
    let config: any

    if (configPath.endsWith('.ts')) {
      // For TypeScript config files, we can try to parse them with a simple regex
      // This is a best-effort approach since we can't easily require TypeScript files
      const content = fs.readFileSync(configPath, 'utf-8')
      const pageExtensionsMatch = content.match(/pageExtensions\s*:\s*\[([^\]]+)\]/)
      if (pageExtensionsMatch) {
        const extensions = pageExtensionsMatch[1]
          .split(',')
          .map((ext) => ext.trim().replace(/['"]/g, ''))
          .filter(Boolean)
        if (extensions.length > 0) {
          nextConfigCache.set(rootDir, { pageExtensions: extensions })
          return extensions
        }
      }
    } else {
      // For JS/MJS/CJS files, we can try to require them
      try {
        delete require.cache[require.resolve(configPath)]
        config = require(configPath)
      } catch {
        // If require fails, try dynamic import
        try {
          config = require(configPath)
        } catch {
          // Ignore
        }
      }
    }

    if (config && config.pageExtensions && Array.isArray(config.pageExtensions)) {
      nextConfigCache.set(rootDir, { pageExtensions: config.pageExtensions })
      return config.pageExtensions
    }
  } catch (error) {
    // If anything fails, fall back to defaults
    console.warn(`Failed to read Next.js config from ${configPath}: ${error}`)
  }

  nextConfigCache.set(rootDir, { pageExtensions: defaultExtensions })
  return defaultExtensions
}
