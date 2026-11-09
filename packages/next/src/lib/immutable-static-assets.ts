import { escapeStringRegexp } from '../shared/lib/escape-regexp'

/**
 * Matches the first segments under `_next/static` whose files Next.js emits
 * with a content hash or the build ID in their path. Those files never change,
 * so they're always served as immutable, and next.config.js `headers()` and
 * Proxy can't override that. Other files under `_next/static`, such as
 * `service-worker/` and files that users or plugins emit there, may have no
 * hash in their name, so the pattern leaves them out.
 *
 * The pattern has no anchors and no basePath, so callers can embed it.
 */
export function getImmutableStaticFolderPattern(buildId: string): string {
  return `(?:[^/]+/pages|pages|chunks|immutable|runtime|css|image|media|${escapeStringRegexp(buildId)})`
}

/**
 * Matches a file path relative to `/_next/static`, for example
 * `/chunks/main-abc123.js`, that is in a hashed folder (see
 * `getImmutableStaticFolderPattern`).
 */
export function getImmutableStaticAssetRegex(buildId: string): RegExp {
  return new RegExp(`^/${getImmutableStaticFolderPattern(buildId)}/.+`)
}
