import { promisify } from 'util'
import globOriginal from 'next/dist/compiled/glob'
import * as Log from '../build/output/log'
import path from 'path'
import fs from 'fs'
import isError from './is-error'

const glob = promisify(globOriginal)

interface ResolvedBuildPaths {
  appPaths: string[]
  pagePaths: string[]
}

/**
 * Resolves glob patterns and explicit paths to actual file paths
 * Categorizes them into App Router and Pages Router paths
 *
 * @param patterns - Array of glob patterns or explicit paths
 * @param projectDir - Root project directory
 * @returns Object with categorized app and page paths
 */
export async function resolveBuildPaths(
  patterns: string[],
  projectDir: string
): Promise<ResolvedBuildPaths> {
  const appPaths: Set<string> = new Set()
  const pagePaths: Set<string> = new Set()

  for (const pattern of patterns) {
    const trimmed = pattern.trim()

    if (!trimmed) {
      continue
    }

    // Detect if pattern is glob pattern (contains glob special chars)
    const isGlobPattern = /[*?[\]{}!]/.test(trimmed)

    if (isGlobPattern) {
      try {
        // Resolve glob pattern
        const matches = (await glob(trimmed, {
          cwd: projectDir,
        })) as string[]

        if (matches.length === 0) {
          Log.warn(`Glob pattern "${trimmed}" did not match any files`)
        }

        for (const file of matches) {
          // Skip directories, only process files
          if (!fs.statSync(path.join(projectDir, file)).isDirectory()) {
            categorizeAndAddPath(file, appPaths, pagePaths)
          }
        }
      } catch (error) {
        throw new Error(
          `Failed to resolve glob pattern "${trimmed}": ${
            isError(error) ? error.message : String(error)
          }`
        )
      }
    } else {
      // Explicit path - categorize based on prefix
      categorizeAndAddPath(trimmed, appPaths, pagePaths, projectDir)
    }
  }

  return {
    appPaths: Array.from(appPaths).sort(),
    pagePaths: Array.from(pagePaths).sort(),
  }
}

/**
 * Categorizes a file path to either app or pages router based on its prefix,
 * and normalizes it to the format expected by Next.js internal build system.
 *
 * The internal build system expects:
 * - App router: paths with leading slash (e.g., "/page.tsx", "/dashboard/page.tsx")
 * - Pages router: paths with leading slash (e.g., "/index.tsx", "/about.tsx")
 *
 * Examples:
 * - "app/page.tsx" → appPaths.add("/page.tsx")
 * - "app/dashboard/page.tsx" → appPaths.add("/dashboard/page.tsx")
 * - "pages/index.tsx" → pagePaths.add("/index.tsx")
 * - "pages/about.tsx" → pagePaths.add("/about.tsx")
 * - "/page.tsx" → appPaths.add("/page.tsx") (already in app router format)
 */
function categorizeAndAddPath(
  filePath: string,
  appPaths: Set<string>,
  pagePaths: Set<string>,
  projectDir?: string
): void {
  // Normalize path separators to forward slashes (Windows compatibility)
  const normalized = filePath.replace(/\\/g, '/')

  // Skip non-file entries (like directories without extensions)
  if (normalized.endsWith('/')) {
    return
  }

  if (normalized.startsWith('app/')) {
    // App router path: remove 'app/' prefix and ensure leading slash
    // "app/page.tsx" → "/page.tsx"
    // "app/dashboard/page.tsx" → "/dashboard/page.tsx"
    const withoutPrefix = normalized.slice(4) // Remove "app/"
    appPaths.add('/' + withoutPrefix)
  } else if (normalized.startsWith('pages/')) {
    // Pages router path: remove 'pages/' prefix and add leading slash
    // "pages/index.tsx" → "/index.tsx"
    // "pages/about.tsx" → "/about.tsx"
    const withoutPrefix = normalized.slice(6) // Remove "pages/"
    pagePaths.add('/' + withoutPrefix)
  } else if (normalized.startsWith('/')) {
    // Leading slash suggests app router format (already in correct format)
    // "/page.tsx" → "/page.tsx" (no change needed)
    appPaths.add(normalized)
  } else {
    // No obvious prefix - try to detect based on file existence
    if (projectDir) {
      const appPath = path.join(projectDir, 'app', normalized)
      const pagesPath = path.join(projectDir, 'pages', normalized)

      if (fs.existsSync(appPath)) {
        appPaths.add('/' + normalized)
      } else if (fs.existsSync(pagesPath)) {
        pagePaths.add('/' + normalized)
      } else {
        // Default to pages router for paths without clear indicator
        pagePaths.add('/' + normalized)
      }
    } else {
      // Without projectDir context, default to pages router
      pagePaths.add('/' + normalized)
    }
  }
}

/**
 * Parse build paths from comma-separated format
 * Supports:
 * - Comma-separated values: "app/page.tsx,app/about/page.tsx"
 *
 * @param input - String input to parse
 * @returns Array of path patterns
 */
export function parseBuildPathsInput(input: string): string[] {
  // Comma-separated values
  return input
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}
