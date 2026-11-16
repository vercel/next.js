import {
  htmlEscapeAttributeString,
  htmlEscapeJsonString,
} from '../../shared/lib/htmlescape'
import {
  getTurbopackChunkGroupBootstrap,
  type BuildManifest,
} from '../get-page-files'
import { streamFromString } from '../stream-utils/node-web-streams-helper'

/**
 * The Turbopack chunk-group bootstrap: an inline script, or, with
 * `experimental.externalBrowserRuntime`, JSON data that `getRequiredScripts`
 * attaches to the Turbopack runtime's own `<script>` tag, which reads it from
 * `document.currentScript`. The data form is never emitted as a separate tag.
 */
export type TurbopackBootstrap =
  | { scriptContent: string; data?: never }
  | { scriptContent?: never; data: string }

export function getTurbopackBootstrap(
  buildManifest: BuildManifest,
  pages: readonly string[],
  externalBrowserRuntime: boolean
): TurbopackBootstrap | undefined {
  if (
    !buildManifest.pagesChunkGroupBootstrapParams ||
    !buildManifest.chunkLoadingGlobal
  ) {
    return undefined
  }

  if (externalBrowserRuntime) {
    const params = pages
      .map((page) => buildManifest.pagesChunkGroupBootstrapParams![page])
      .filter(Boolean)
    return params.length > 0 ? { data: JSON.stringify(params) } : undefined
  }

  const scriptContent = getTurbopackChunkGroupBootstrap(
    buildManifest.pagesChunkGroupBootstrapParams,
    buildManifest.chunkLoadingGlobal,
    pages
  )
  return scriptContent ? { scriptContent } : undefined
}

/**
 * A Cache Components static shell cannot carry a per-request CSP nonce, so an
 * inline bootstrap script is emitted with the resume instead.
 */
export function createTurbopackBootstrapStream(
  scriptContent: string,
  nonce: string | undefined
): ReadableStream<Uint8Array> {
  const startScriptTag = nonce
    ? `<script nonce="${htmlEscapeAttributeString(nonce)}">`
    : '<script>'
  return streamFromString(
    `${startScriptTag}${htmlEscapeJsonString(scriptContent)}</script>`
  )
}

/**
 * The inline bootstrap for serving a static shell on its own, without the
 * resume that normally includes it. Returns undefined when the build has no
 * bootstrap params, or when the bootstrap rides on the runtime script tag.
 */
export function createTurbopackBootstrapStreamForPage(
  buildManifest: BuildManifest,
  page: string,
  nonce: string | undefined,
  externalBrowserRuntime: boolean
): ReadableStream<Uint8Array> | undefined {
  const bootstrap = getTurbopackBootstrap(
    buildManifest,
    [page],
    externalBrowserRuntime
  )
  return bootstrap?.scriptContent
    ? createTurbopackBootstrapStream(bootstrap.scriptContent, nonce)
    : undefined
}
