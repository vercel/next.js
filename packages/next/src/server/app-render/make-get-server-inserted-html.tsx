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

export function makeGetServerInsertedHTML({
  polyfills,
  renderServerInsertedHTML,
  serverCapturedErrors,
  tracingMetadata,
  basePath,
}: {
  polyfills: JSX.IntrinsicElements['script'][]
  renderServerInsertedHTML: () => React.ReactNode
  tracingMetadata: ClientTraceDataEntry[] | undefined
  serverCapturedErrors: Array<unknown>
  basePath: string
}) {
  let flushedErrorMetaTagsUntilIndex = 0
  // flag for static content that only needs to be flushed once
  let hasFlushedInitially = false

  const polyfillTags = polyfills.map((polyfill) => {
    return <script key={polyfill.src} {...polyfill} />
  })

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

    const traceMetaTags = (tracingMetadata || []).map(
      ({ key, value }, index) => (
        <meta key={`next-trace-data-${index}`} name={key} content={value} />
      )
    )

    const serverInsertedHTML = renderServerInsertedHTML()

    // Skip React rendering if we know the content is empty.
    if (
      polyfillTags.length === 0 &&
      traceMetaTags.length === 0 &&
      errorMetaTags.length === 0 &&
      Array.isArray(serverInsertedHTML) &&
      serverInsertedHTML.length === 0
    ) {
      return ''
    }

    const stream = await renderToReadableStream(
      <>
        {
          /* Insert the polyfills if they haven't been flushed yet. */
          hasFlushedInitially ? null : polyfillTags
        }
        {serverInsertedHTML}
        {hasFlushedInitially ? null : traceMetaTags}
        {errorMetaTags}
      </>,
      {
        // Larger chunk because this isn't sent over the network.
        // Let's set it to 1MB.
        progressiveChunkSize: 1024 * 1024,
      }
    )

    hasFlushedInitially = true

    // There's no need to wait for the stream to be ready
    // e.g. calling `await stream.allReady` because `streamToString` will
    // wait and decode the stream progressively with better parallelism.
    return streamToString(stream)
  }
}
