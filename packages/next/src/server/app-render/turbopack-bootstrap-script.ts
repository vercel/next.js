import {
  htmlEscapeAttributeString,
  htmlEscapeJsonString,
} from '../../shared/lib/htmlescape'
import {
  getTurbopackChunkGroupBootstrap,
  type BuildManifest,
} from '../get-page-files'
import { streamFromString } from '../stream-utils/node-web-streams-helper'

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
 * A Cache Components static shell cannot carry a per-request CSP nonce, so its
 * bootstrap is emitted with the resume. Data templates need no nonce and are
 * consumed by the shared Turbopack runtime, before the framework entry can run.
 */
export function createTurbopackBootstrapStream(
  bootstrap: TurbopackBootstrap,
  nonce: string | undefined
): ReadableStream<Uint8Array> {
  if (bootstrap.data !== undefined) {
    return streamFromString(
      `<template data-next-turbopack="${htmlEscapeAttributeString(bootstrap.data)}"></template>`
    )
  }

  const startScriptTag = nonce
    ? `<script nonce="${htmlEscapeAttributeString(nonce)}">`
    : '<script>'
  return streamFromString(
    `${startScriptTag}${htmlEscapeJsonString(bootstrap.scriptContent)}</script>`
  )
}

/**
 * The bootstrap for serving a static shell on its own, without the resume that
 * normally includes it. Returns undefined when the build has no bootstrap params.
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
  return bootstrap
    ? createTurbopackBootstrapStream(bootstrap, nonce)
    : undefined
}
