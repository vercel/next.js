import path from 'path'
import fs from 'fs'
import {
  matchPatternOrExact,
  matchedText,
} from '../plugins/jsconfig-paths-plugin'

interface PathMapping {
  pattern: string
  paths: string[]
}

/**
 * Sass Importer interface (sync version)
 * @see https://sass-lang.com/documentation/js-api/interfaces/importer/
 */
interface SassImporter {
  findFileUrl(url: string): URL | null
}

/**
 * Creates a custom Sass importer that resolves path aliases from tsconfig.json/jsconfig.json
 * This allows Sass to understand TypeScript path mappings like:
 * - "#stylesheets/*": ["./src/stylesheets/*"]
 * - "@components/*": ["./src/components/*"]
 */
export function createPathAliasImporter(
  baseUrl: string,
  paths: Record<string, string[]> | undefined
): SassImporter | undefined {
  if (!paths || Object.keys(paths).length === 0) {
    // No path aliases configured
    return undefined
  }

  // Parse path mappings once during initialization
  const pathMappings: PathMapping[] = Object.keys(paths).map((pattern) => ({
    pattern,
    paths: paths[pattern],
  }))

  const patternStrings = pathMappings.map((p) => p.pattern)

  return {
    findFileUrl(url: string): URL | null {
      // Only process non-relative imports (path aliases start with special chars like # or @)
      // Relative imports like './foo' or '../bar' should be handled by Sass normally
      if (url.startsWith('.') || url.startsWith('/')) {
        return null
      }

      // Try to match the import URL against configured path patterns
      const matchedPattern = matchPatternOrExact(patternStrings, url)
      if (!matchedPattern) {
        return null
      }

      // Find the mapping for this pattern
      const mapping = pathMappings.find((m) => {
        if (typeof matchedPattern === 'string') {
          return m.pattern === matchedPattern
        }
        return (
          m.pattern.includes('*') && m.pattern.startsWith(matchedPattern.prefix)
        )
      })

      if (!mapping) {
        return null
      }

      // For each configured path, try to resolve the file
      for (const pathTemplate of mapping.paths) {
        let resolvedPath: string

        if (typeof matchedPattern === 'string') {
          // Exact match (no wildcard)
          resolvedPath = path.resolve(baseUrl, pathTemplate)
        } else {
          // Pattern match with wildcard
          const matched = matchedText(matchedPattern, url)
          resolvedPath = path.resolve(
            baseUrl,
            pathTemplate.replace('*', matched)
          )
        }

        // Try different file extensions that Sass supports
        const extensions = ['.scss', '.sass', '.css', '']

        for (const ext of extensions) {
          const fullPath = resolvedPath + ext

          // Check if file exists
          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            // Return as file:// URL which Sass expects
            return new URL(`file://${fullPath}`)
          }

          // Also try with _partial.scss convention (Sass partials)
          const dir = path.dirname(resolvedPath)
          const base = path.basename(resolvedPath)
          const partialPath = path.join(dir, `_${base}${ext}`)

          if (fs.existsSync(partialPath) && fs.statSync(partialPath).isFile()) {
            return new URL(`file://${partialPath}`)
          }
        }

        // Try as directory with index file
        if (
          fs.existsSync(resolvedPath) &&
          fs.statSync(resolvedPath).isDirectory()
        ) {
          for (const indexFile of [
            'index.scss',
            'index.sass',
            '_index.scss',
            '_index.sass',
          ]) {
            const indexPath = path.join(resolvedPath, indexFile)
            if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
              return new URL(`file://${indexPath}`)
            }
          }
        }
      }

      // Could not resolve, let Sass handle it (might be a node_modules package)
      return null
    },
  }
}
