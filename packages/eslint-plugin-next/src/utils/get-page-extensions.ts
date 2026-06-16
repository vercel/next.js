import * as path from 'path'
import * as fs from 'fs'

const DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js']

// Cache for fs.existsSync lookups so we only check the config file once per cwd.
const fsExistsSyncCache: Record<string, boolean> = {}

const fileExists = (filePath: string): boolean => {
  if (fsExistsSyncCache[filePath] !== undefined) {
    return fsExistsSyncCache[filePath]
  }
  const exists = fs.existsSync(filePath)
  fsExistsSyncCache[filePath] = exists
  return exists
}

/**
 * Try to load `next.config.js` or `next.config.mjs` from `cwd` and extract
 * the user-configured `pageExtensions`. Returns `undefined` if no readable
 * config file is found or the value cannot be read.
 *
 * `next.config.ts` is intentionally not supported here: parsing TypeScript at
 * ESLint time would require pulling in a TS toolchain. The common case
 * (`.js` / `.mjs`) is what we cover.
 */
function tryLoadPageExtensions(cwd: string): string[] | undefined {
  const candidates = [
    path.join(cwd, 'next.config.js'),
    path.join(cwd, 'next.config.mjs'),
  ]

  for (const configPath of candidates) {
    if (!fileExists(configPath)) {
      continue
    }
    try {
      // Clear the require cache so updates to next.config are picked up
      // between lint runs during development.
      delete require.cache[require.resolve(configPath)]
      const mod = require(configPath)
      const exported = mod && mod.default ? mod.default : mod
      const ext = exported && exported.pageExtensions
      if (Array.isArray(ext) && ext.length > 0 && ext.every((e: unknown) => typeof e === 'string')) {
        return ext as string[]
      }
    } catch {
      // If the config throws on load (e.g. it depends on runtime env vars),
      // fall through and use the defaults rather than breaking lint.
      continue
    }
  }
  return undefined
}

/**
 * Resolve the active `pageExtensions` for a given working directory.
 *
 * Reads `next.config.{js,mjs}` if present, otherwise returns the default
 * list (`['tsx', 'ts', 'jsx', 'js']`) that Next.js itself uses.
 */
export function getPageExtensions(cwd: string): string[] {
  const fromConfig = tryLoadPageExtensions(cwd)
  if (fromConfig) {
    return fromConfig
  }
  return [...DEFAULT_PAGE_EXTENSIONS]
}
