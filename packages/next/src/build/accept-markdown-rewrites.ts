import type { Rewrite } from '../lib/load-custom-routes'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  ACTION_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_RSC_UNION_QUERY,
  RSC_HEADER,
} from '../client/components/app-router-headers'
import { COOKIE_NAME_PRERENDER_BYPASS } from '../server/api-utils'
import {
  ACCEPT_MARKDOWN_PATTERN,
  encodeMarkdownPathChars,
  getMarkdownArtifactPath,
  getMarkdownPathname,
} from '../server/lib/accept-markdown'
import { escapeStringRegexp } from '../shared/lib/escape-regexp'

/**
 * Requests that keep their normal handling instead of being rewritten to a
 * Markdown alternate: client router (RSC, prefetch, segment prefetch, `_rsc`
 * cache-busting), server actions, and Draft Mode.
 */
const MARKDOWN_REWRITE_MISSING: NonNullable<Rewrite['missing']> = [
  { type: 'header', key: RSC_HEADER },
  { type: 'header', key: NEXT_ROUTER_PREFETCH_HEADER },
  { type: 'header', key: NEXT_ROUTER_SEGMENT_PREFETCH_HEADER },
  { type: 'header', key: ACTION_HEADER },
  { type: 'query', key: NEXT_RSC_UNION_QUERY },
  { type: 'cookie', key: COOKIE_NAME_PRERENDER_BYPASS },
]

// Characters path-to-regexp treats specially in a rewrite source, escaped so
// concrete paths match literally. Destinations are parsed as URLs, where `\`
// isn't an escape, so they're percent-encoded instead.
const escapeSource = (pathname: string) =>
  pathname.replace(/[:()*?+{}\\]/g, '\\$&')

/**
 * `experimental.acceptMarkdown`: turns the alternates written while
 * prerendering into the same routing a user would write by hand — one
 * `beforeFiles` rewrite per path, sending `Accept: text/markdown` requests to
 * the path's `.md` URL. Paths whose `.md` URL is already served by a public
 * file or another route, or claimed by another page, are skipped with a
 * warning and keep serving HTML.
 */
export function generateMarkdownRewrites({
  prerenderedPaths,
  distDir,
  publicDir,
  routePathnames,
  basePath,
}: {
  /** Prerendered paths (without basePath). */
  prerenderedPaths: Iterable<string>
  distDir: string
  /** The project's `public` directory, when it exists. */
  publicDir: string | undefined
  /** Pathnames of all app and pages routes, e.g. `/notes.md` for `app/notes.md/route.ts`. */
  routePathnames: ReadonlySet<string>
  basePath: string
}): { rewrites: Rewrite[]; alternates: string[]; warnings: string[] } {
  const byMarkdownPathname = new Map<string, string[]>()
  for (const pathname of prerenderedPaths) {
    const artifact = path.join(distDir, getMarkdownArtifactPath(pathname))
    if (!existsSync(artifact)) continue
    const markdownPathname = getMarkdownPathname(pathname)
    const claimed = byMarkdownPathname.get(markdownPathname)
    if (claimed) claimed.push(pathname)
    else byMarkdownPathname.set(markdownPathname, [pathname])
  }

  const rewrites: Rewrite[] = []
  const alternates: string[] = []
  const warnings: string[] = []
  const skip = (pathname: string, markdownPathname: string, by: string) =>
    warnings.push(
      `\`experimental.acceptMarkdown\`: skipped the Markdown alternate of "${pathname}" because "${markdownPathname}" is already served by ${by}. "${pathname}" serves HTML only.`
    )

  for (const [markdownPathname, pathnames] of [...byMarkdownPathname].sort()) {
    if (pathnames.length > 1) {
      for (const pathname of pathnames) {
        skip(
          pathname,
          markdownPathname,
          `the alternates of ${pathnames.map((p) => `"${p}"`).join(' and ')}`
        )
      }
      continue
    }
    const [pathname] = pathnames
    if (publicDir && existsSync(path.join(publicDir, markdownPathname))) {
      skip(pathname, markdownPathname, `public${markdownPathname}`)
      continue
    }
    if (routePathnames.has(markdownPathname)) {
      skip(pathname, markdownPathname, `the route "${markdownPathname}"`)
      continue
    }

    const source = pathname === '/' ? basePath || '/' : `${basePath}${pathname}`
    rewrites.push({
      source: escapeSource(source),
      destination: encodeMarkdownPathChars(`${basePath}${markdownPathname}`),
      // Concrete paths are matched literally rather than as path-to-regexp
      // patterns, like interception rewrites.
      regex: `^${escapeStringRegexp(source)}(?:/)?$`,
      internal: true,
      has: [{ type: 'header', key: 'accept', value: ACCEPT_MARKDOWN_PATTERN }],
      missing: MARKDOWN_REWRITE_MISSING,
    })
    alternates.push(pathname)
  }

  return { rewrites, alternates, warnings }
}
