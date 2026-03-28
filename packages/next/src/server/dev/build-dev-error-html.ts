import { BUILD_MANIFEST } from '../../shared/lib/constants'
import { join } from 'path'
import { HTML_CONTENT_TYPE_HEADER } from '../../lib/constants'
import RenderResult from '../render-result'
import { tryLoadManifestWithRetries } from '../load-components'
import type { BuildManifest } from '../get-page-files'
import { randomUUID } from 'crypto'
import { encodeURIPath } from '../../shared/lib/encode-uri-path'

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
 * Uses a `__next_dev_error_shell__` marker on the `<html>` element so the
 * client can detect this shell and skip mounting the full App Router React
 * tree. This is distinct from `__next_error__` which is used by
 * app-render.tsx for SSR errors that have valid RSC payloads. Error details
 * are embedded in a `<template>` tag for the overlay to pick up.
 *
 * The script loading mirrors what React's renderToReadableStream does:
 * all rootMainFiles are loaded as `<script async>` tags. The last
 * rootMainFile is the turbopack runtime bootstrap which contains the
 * chunk loader, module system, and entry module IDs. When it executes,
 * it processes all buffered chunk registrations and starts the app
 * entry point (app-next-turbopack), which mounts the dev overlay.
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

  const requestId = randomUUID()

  // Load all rootMainFiles as async scripts, mirroring React's behavior.
  // Each chunk pushes module registrations onto the TURBOPACK global array.
  // The last chunk is the turbopack runtime bootstrap which processes all
  // registrations and executes the entry module (app-next-turbopack).
  const scriptTags = rootMainFiles
    .map(
      (file) =>
        `<script src="${escapeHtmlAttr(`${assetPrefix}/_next/${encodeURIPath(file)}`)}" async=""></script>`
    )
    .join('\n')

  const html = `<!DOCTYPE html>
<html id="__next_dev_error_shell__">
  <head>
    <meta charset="utf-8">
  </head>
  <body>
    ${errorTemplate}
    <script>self.__next_r=${JSON.stringify(requestId)}</script>
    <script>(self.__next_f=self.__next_f||[]).push([0])</script>
    <script>self.__next_f.push([1,"0:null\\n"])</script>
${scriptTags}
  </body>
</html>`

  return RenderResult.fromStatic(html, HTML_CONTENT_TYPE_HEADER)
}
