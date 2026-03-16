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
 * Escapes Next.js dynamic route bracket expressions so glob treats them as
 * literal directory names rather than character classes.
 *
 * e.g., "app/blog/[slug]/** /page.tsx" → "app/blog/\[slug\]/** /page.tsx"
 */
function escapeBrackets(pattern: string): string {
  // Match Next.js dynamic route patterns: [name], [...name], [[...name]]
  return pattern.replace(/\[\[?\.\.\.[^\]]+\]?\]|\[[^\]]+\]/g, (match) =>
    match.replace(/\[/g, '\\[').replace(/\]/g, '\\]')
  )
}

/**
 * Resolves glob patterns and explicit paths to actual file paths.
 * Categorizes them into App Router and Pages Router paths.
 *
 * Supports negation patterns prefixed with "!" to exclude paths.
 * e.g., "app/**,!app/[lang]/page.js" includes all App Router paths except
 * app/[lang]/page.js
 */
export async function resolveBuildPaths(
  patterns: string[],
  projectDir: string
): Promise<ResolvedBuildPaths> {
  const appPaths: Set<string> = new Set()
  const pagePaths: Set<string> = new Set()

  const includePatterns: string[] = []
  const excludePatterns: string[] = []

  for (const pattern of patterns) {
    const trimmed = pattern.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('!')) {
      excludePatterns.push(escapeBrackets(trimmed.slice(1)))
    } else {
      includePatterns.push(escapeBrackets(trimmed))
    }
  }

  // Default to matching all files when only negation patterns are provided.
  if (includePatterns.length === 0 && excludePatterns.length > 0) {
    includePatterns.push('**')
  }

  // Combine patterns using brace expansion: {pattern1,pattern2}
  const combinedPattern =
    includePatterns.length === 1
      ? includePatterns[0]
      : `{${includePatterns.join(',')}}`

  try {
    const matches = (await glob(combinedPattern, {
      cwd: projectDir,
      ignore: excludePatterns,
    })) as string[]

    if (matches.length === 0) {
      Log.warn(`Pattern "${patterns.join(',')}" did not match any files`)
    }

    for (const file of matches) {
      if (!fs.statSync(path.join(projectDir, file)).isDirectory()) {
        categorizeAndAddPath(file, appPaths, pagePaths)
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to resolve pattern "${patterns.join(',')}": ${
        isError(error) ? error.message : String(error)
      }`
    )
  }

  return {
    appPaths: Array.from(appPaths).sort(),
    pagePaths: Array.from(pagePaths).sort(),
  }
}

/**
 * Categorizes a file path to either app or pages router based on its prefix.
 * For app router, only route-defining files (page.*, route.*) are included.
 *
 * Examples:
 * - "app/page.tsx" → appPaths.add("/page.tsx")
 * - "app/layout.tsx" → skipped (not a route file)
 * - "pages/index.tsx" → pagePaths.add("/index.tsx")
 */
function categorizeAndAddPath(
  filePath: string,
  appPaths: Set<string>,
  pagePaths: Set<string>
): void {
  const normalized = filePath.replace(/\\/g, '/')

  if (normalized.startsWith('app/')) {
    // Only include route-defining files (page.* or route.*)
    if (/\/(page|route)\.[^/]+$/.test(normalized)) {
      appPaths.add('/' + normalized.slice(4))
    }
  } else if (normalized.startsWith('pages/')) {
    pagePaths.add('/' + normalized.slice(6))
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
