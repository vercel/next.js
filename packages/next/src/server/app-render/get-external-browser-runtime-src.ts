import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import type { BuildManifest } from '../get-page-files'
import type { AppRenderContext } from './app-render'
import { getAssetQueryString } from './get-asset-query-string'

/**
 * Resolves the `unstable_externalRuntimeSrc` value for React's Fizz options.
 *
 * When set, React streams its instruction set as `<template data-rci="" …>`
 * elements instead of inline `<script>` tags, and emits a single
 * `<script src async>` for this runtime itself. It also stops injecting its
 * inline form-replaying runtime, since the external runtime covers it.
 *
 * Returns `undefined` when the feature is off, which leaves React on its default
 * inline-script format. Only pass the result to `renderToReadableStream` and
 * `prerender`: `resume` deliberately does not accept it, because the streaming
 * format is carried in the postponed state's resumable state and the prerendered
 * shell already contains the `<script src>`.
 */
export function getExternalBrowserRuntimeSrc(
  ctx: AppRenderContext,
  buildManifest: DeepReadonly<BuildManifest>,
  externalBrowserRuntime: boolean,
  assetPrefix: string,
  subresourceIntegrityManifest: DeepReadonly<Record<string, string>> | undefined
): { src: string; integrity: string | undefined } | undefined {
  if (!externalBrowserRuntime) {
    return undefined
  }

  const file = buildManifest.externalBrowserRuntimeFile
  if (file === undefined) {
    // Deliberately fatal rather than falling back to inline scripts. Silently
    // reverting would serve a document that needs `unsafe-inline` to an app
    // configured on the assumption that it does not.
    throw new Error(
      '`experimental.externalBrowserRuntime` is enabled but the runtime asset is missing from the build manifest. ' +
        'This usually means `.next` was produced by a build that did not have the flag enabled. Rebuild the app.'
    )
  }

  return {
    src: `${assetPrefix}/_next/${file}${getAssetQueryString(ctx, false)}`,
    integrity: subresourceIntegrityManifest?.[file],
  }
}
