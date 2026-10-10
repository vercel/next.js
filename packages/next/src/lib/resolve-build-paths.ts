import { promisify } from 'util'
import globOriginal from 'next/dist/compiled/glob'
import * as Log from '../build/output/log'
import path from 'path'
import fs from 'fs'
import isError from './is-error'
import { createValidFileMatcher } from '../server/lib/find-page-file'
import type { PageExtensions } from '../build/page-extensions-type'

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
  projectDir: string,
  pageExtensions: PageExtensions
): Promise<ResolvedBuildPaths> {
  const appPaths: Set<string> = new Set()
  const pagePaths: Set<string> = new Set()
  const validFileMatcher = createValidFileMatcher(pageExtensions, undefined)

  // Detect whether the project keeps its routes under `src/` so we can accept
  // patterns written with or without that prefix (e.g. both `app/foo/page.tsx`
  // and `src/app/foo/page.tsx`).
  const useSrcApp = fs.existsSync(path.join(projectDir, 'src', 'app'))
  const useSrcPages = fs.existsSync(path.join(projectDir, 'src', 'pages'))

  const includePatterns: string[] = []
  const excludePatterns: string[] = []

  for (const pattern of patterns) {
    const trimmed = pattern.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('!')) {
      excludePatterns.push(
        escapeBrackets(
          addSrcPrefixIfNeeded(trimmed.slice(1), useSrcApp, useSrcPages)
        )
      )
    } else {
      includePatterns.push(
        escapeBrackets(addSrcPrefixIfNeeded(trimmed, useSrcApp, useSrcPages))
      )
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
        categorizeAndAddPath(file, appPaths, pagePaths, validFileMatcher)
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
 * When the project keeps its `app/` or `pages/` directory under `src/`, prepend
 * `src/` to bare patterns so the glob actually matches files on disk. Patterns
 * that already include the `src/` prefix are returned unchanged.
 */
function addSrcPrefixIfNeeded(
  pattern: string,
  useSrcApp: boolean,
  useSrcPages: boolean
): string {
  const normalized = pattern.replace(/\\/g, '/')
  if (useSrcApp && /^app\//.test(normalized)) {
    return 'src/' + normalized
  }
  if (useSrcPages && /^pages\//.test(normalized)) {
    return 'src/' + normalized
  }
  return pattern
}

/**
 * Categorizes a file path to either app or pages router based on its prefix.
 * For app router, only route-defining files are included.
 *
 * Accepts both top-level (`app/...`, `pages/...`) and src-prefixed
 * (`src/app/...`, `src/pages/...`) project structures.
 *
 * Examples:
 * - "app/page.tsx" → appPaths.add("/page.tsx")
 * - "src/app/page.tsx" → appPaths.add("/page.tsx")
 * - "app/layout.tsx" → skipped (not a route file)
 * - "pages/index.tsx" → pagePaths.add("/index.tsx")
 */
function categorizeAndAddPath(
  filePath: string,
  appPaths: Set<string>,
  pagePaths: Set<string>,
  validFileMatcher: ReturnType<typeof createValidFileMatcher>
): void {
  let normalized = filePath.replace(/\\/g, '/')

  if (normalized.startsWith('src/')) {
    normalized = normalized.slice(4)
  }

  if (normalized.startsWith('app/')) {
    const appRelativePath = '/' + normalized.slice(4)
    if (validFileMatcher.isAppRouterPage(appRelativePath)) {
      appPaths.add(appRelativePath)
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
