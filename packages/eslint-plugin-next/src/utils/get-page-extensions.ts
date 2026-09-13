import * as path from 'path'
import * as fs from 'fs'

const configFileNames = [
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'next.config.cjs',
]

/**
 * Gets the pageExtensions from next.config.js
 */
export function getPageExtensions(
  rootDir: string
): string[] {
  // Default Next.js page extensions
  const defaultExtensions = ['js', 'jsx', 'ts', 'tsx', 'mdx', 'md']

  for (const configFileName of configFileNames) {
    const configPath = path.join(rootDir, configFileName)
    if (fs.existsSync(configPath)) {
      try {
        // Clear require cache to get fresh config
        delete require.cache[require.resolve(configPath)]
        
        // Try to load the config
        let config: any
        if (configFileName.endsWith('.mjs')) {
          // For ESM configs, we need to use a different approach
          const content = fs.readFileSync(configPath, 'utf8')
          // Simple regex to extract pageExtensions
          const match = content.match(/pageExtensions\s*:\s*\[([^\]]+)\]/)
          if (match) {
            const extensions = match[1]
              .split(',')
              .map((ext: string) => ext.trim().replace(/['"]/g, ''))
            return extensions.length > 0 ? extensions : defaultExtensions
          }
        } else {
          // For CommonJS configs
          config = require(configPath)
          const nextConfig = config.default || config
          if (nextConfig.pageExtensions) {
            return Array.isArray(nextConfig.pageExtensions)
              ? nextConfig.pageExtensions
              : defaultExtensions
          }
        }
      } catch (e) {
        // If we can't parse the config, return default extensions
        console.warn(`Could not parse ${configFileName}:`, e)
      }
    }
  }

  return defaultExtensions
}

/**
 * Creates a regex pattern from page extensions
 */
export function createPageExtensionsRegex(extensions: string[]): RegExp {
  const extPattern = extensions.map(ext => ext.replace('.', '\\.')).join('|')
  return new RegExp(`\\.(${extPattern})$`)
}
