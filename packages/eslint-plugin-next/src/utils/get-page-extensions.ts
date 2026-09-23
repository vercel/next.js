import * as path from 'path'
import * as fs from 'fs'

/**
 * Default page extensions supported by Next.js
 */
const DEFAULT_PAGE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx']

/**
 * Attempts to read pageExtensions from next.config.js/mjs/ts
 * Falls back to default extensions if config cannot be read
 */
export function getPageExtensions(rootDir: string): string[] {
  const configFiles = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'next.config.cjs',
  ]

  for (const configFile of configFiles) {
    const configPath = path.join(rootDir, configFile)
    if (!fs.existsSync(configPath)) {
      continue
    }

    try {
      // For .ts files, we'd need to compile them, which is complex
      // For now, we'll only handle .js and .mjs files
      if (configFile.endsWith('.ts')) {
        continue
      }

      // Read and evaluate the config file
      // This is a simplified approach - in production, you might want to use a proper config loader
      const configContent = fs.readFileSync(configPath, 'utf-8')
      
      // Try to extract pageExtensions using regex (simple approach)
      // This handles: pageExtensions: ['tsx', 'ts', 'jsx', 'js']
      const pageExtensionsMatch = configContent.match(
        /pageExtensions\s*[:=]\s*\[(.*?)\]/s
      )

      if (pageExtensionsMatch) {
        const extensions = pageExtensionsMatch[1]
          .split(',')
          .map((ext) => ext.trim().replace(/['"]/g, ''))
          .filter((ext) => ext.length > 0)

        if (extensions.length > 0) {
          return extensions
        }
      }
    } catch (error) {
      // If we can't read the config, fall back to defaults
      continue
    }
  }

  return DEFAULT_PAGE_EXTENSIONS
}

/**
 * Creates a regex pattern to match page extensions
 */
export function createPageExtensionRegex(extensions: string[]): RegExp {
  const extensionPattern = extensions
    .map((ext) => {
      // Escape special regex characters
      const escaped = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return `\\.${escaped}`
    })
    .join('|')

  return new RegExp(`(${extensionPattern})$`)
}
