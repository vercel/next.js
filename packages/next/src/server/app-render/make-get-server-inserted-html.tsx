/* eslint-disable @next/internal/no-ambiguous-jsx -- whole module is used in React Client */
import React, { type JSX } from 'react'
import { isHTTPAccessFallbackError } from '../../client/components/http-access-fallback/http-access-fallback'
import {
  getURLFromRedirectError,
  getRedirectStatusCodeFromError,
} from '../../client/components/redirect'
import { isRedirectError } from '../../client/components/redirect-error'
import { renderToReadableStream } from 'react-dom/server'
import { streamToString } from '../stream-utils/node-web-streams-helper'
import { RedirectStatusCode } from '../../client/components/redirect-status-code'
import { addPathPrefix } from '../../shared/lib/router/utils/add-path-prefix'
import type { ClientTraceDataEntry } from '../lib/trace/tracer'
import type { CollectedInlineCss } from './types'

export function makeGetServerInsertedHTML({
  polyfills,
  renderServerInsertedHTML,
  serverCapturedErrors,
  tracingMetadata,
  basePath,
  collectedInlineCss,
}: {
  polyfills: JSX.IntrinsicElements['script'][]
  renderServerInsertedHTML: () => React.ReactNode
  tracingMetadata: ClientTraceDataEntry[] | undefined
  serverCapturedErrors: Array<unknown>
  basePath: string
  collectedInlineCss?: CollectedInlineCss
}) {
  let flushedErrorMetaTagsUntilIndex = 0

  // These only need to be rendered once, they'll be set to empty arrays once flushed.
  let polyfillTags = polyfills.map((polyfill) => {
    return <script key={polyfill.src} {...polyfill} />
  })
  let traceMetaTags = (tracingMetadata || []).map(({ key, value }, index) => (
    <meta key={`next-trace-data-${index}`} name={key} content={value} />
  ))

  // Collected inline CSS styles - only need to be rendered once
  let inlineCssStyles = (collectedInlineCss?.styles || []).map((css, index) => (
    <style
      key={`inline-css-${index}`}
      href={css.href}
      precedence={css.precedence}
      nonce={css.nonce}
    >
      {css.content}
    </style>
  ))

  return async function getServerInsertedHTML() {
    // Loop through all the errors that have been captured but not yet
    // flushed.
    const errorMetaTags = []
    while (flushedErrorMetaTagsUntilIndex < serverCapturedErrors.length) {
      const error = serverCapturedErrors[flushedErrorMetaTagsUntilIndex]
      flushedErrorMetaTagsUntilIndex++

      if (isHTTPAccessFallbackError(error)) {
        errorMetaTags.push(
          <meta name="robots" content="noindex" key={error.digest} />,
          process.env.NODE_ENV === 'development' ? (
            <meta name="next-error" content="not-found" key="next-error" />
          ) : null
        )
      } else if (isRedirectError(error)) {
        const redirectUrl = addPathPrefix(
          getURLFromRedirectError(error),
          basePath
        )
        const statusCode = getRedirectStatusCodeFromError(error)
        const isPermanent =
          statusCode === RedirectStatusCode.PermanentRedirect ? true : false
        if (redirectUrl) {
          errorMetaTags.push(
            <meta
              id="__next-page-redirect"
              httpEquiv="refresh"
              content={`${isPermanent ? 0 : 1};url=${redirectUrl}`}
              key={error.digest}
            />
          )
        }
      }
    }

    const serverInsertedHTML = renderServerInsertedHTML()

    // Skip React rendering if we know the content is empty.
    if (
      polyfillTags.length === 0 &&
      traceMetaTags.length === 0 &&
      errorMetaTags.length === 0 &&
      inlineCssStyles.length === 0 &&
      Array.isArray(serverInsertedHTML) &&
      serverInsertedHTML.length === 0
    ) {
      return ''
    }

    const stream = await renderToReadableStream(
      <>
        {inlineCssStyles}
        {polyfillTags}
        {serverInsertedHTML}
        {traceMetaTags}
        {errorMetaTags}
      </>,
      {
        // Larger chunk because this isn't sent over the network.
        // Let's set it to 1MB.
        progressiveChunkSize: 1024 * 1024,
      }
    )

    // The polyfills, trace metadata, and inline CSS have been flushed, so they don't need to be rendered again
    polyfillTags = []
    traceMetaTags = []
    inlineCssStyles = []

    // There's no need to wait for the stream to be ready
    // e.g. calling `await stream.allReady` because `streamToString` will
    // wait and decode the stream progressively with better parallelism.
    return streamToString(stream)
  }
}
