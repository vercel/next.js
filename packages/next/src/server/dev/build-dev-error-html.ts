import { BUILD_MANIFEST } from '../../shared/lib/constants'
import { join } from 'path'
import { HTML_CONTENT_TYPE_HEADER } from '../../lib/constants'
import RenderResult from '../render-result'
import { tryLoadManifestWithRetries } from '../load-components'
import type { BuildManifest } from '../get-page-files'

/**
 * Escapes HTML attribute special characters.
 */
function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Builds a minimal HTML shell for dev mode error pages in App Router apps.
 *
 * Reuses the `__next_error__` pattern: the client detects
 * `document.documentElement.id === '__next_error__'` and does CSR with
 * the dev overlay instead of hydrating. Error details are embedded in a
 * `<template>` tag for the overlay to pick up.
 */
export async function buildAppRouterDevErrorHtml(
  distDir: string,
  assetPrefix: string,
  err: Error | null
): Promise<RenderResult> {
  const manifestPath = join(distDir, BUILD_MANIFEST)
  const buildManifest =
    await tryLoadManifestWithRetries<BuildManifest>(manifestPath)

  const rootMainFiles: readonly string[] = buildManifest?.rootMainFiles ?? []

  // Build <script> tags for bootstrap entry chunks
  const scriptTags = rootMainFiles
    .map(
      (file) =>
        `<script src="${escapeHtmlAttr(`${assetPrefix}/_next/${file}`)}" defer></script>`
    )
    .join('\n    ')

  // Build error template (dev only — passes error details to the overlay)
  let errorTemplate = ''
  if (err) {
    const digest = 'digest' in err ? String((err as any).digest) : ''
    errorTemplate =
      `<template` +
      ` data-next-error-message="${escapeHtmlAttr(err.message)}"` +
      ` data-next-error-digest="${escapeHtmlAttr(digest)}"` +
      ` data-next-error-stack="${escapeHtmlAttr(err.stack ?? '')}">` +
      `</template>`
  }

  const html = `<!DOCTYPE html>
<html id="__next_error__">
  <head>
    <meta charset="utf-8">
    ${scriptTags}
  </head>
  <body>
    ${errorTemplate}
  </body>
</html>`

  return RenderResult.fromStatic(html, HTML_CONTENT_TYPE_HEADER)
}
