import React from 'react'
import { isNotFoundError } from '../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
  getRedirectStatusCodeFromError,
} from '../../client/components/redirect'
import { renderToReadableStream } from 'react-dom/server.edge'
import { streamToString } from '../stream-utils/node-web-streams-helper'
import { RedirectStatusCode } from '../../client/components/redirect-status-code'
import { addPathPrefix } from '../../shared/lib/router/utils/add-path-prefix'

export function makeGetServerInsertedHTML({
  polyfills,
  renderServerInsertedHTML,
  serverCapturedErrors,
  basePath,
}: {
  polyfills: JSX.IntrinsicElements['script'][]
  renderServerInsertedHTML: () => React.ReactNode
  serverCapturedErrors: Error[]
  basePath: string
}) {
  let flushedErrorMetaTagsUntilIndex = 0
  let hasUnflushedPolyfills = polyfills.length !== 0

  return async function getServerInsertedHTML() {
    // Loop through all the errors that have been captured but not yet
    // flushed.
    const errorMetaTags = []
    while (flushedErrorMetaTagsUntilIndex < serverCapturedErrors.length) {
      const error = serverCapturedErrors[flushedErrorMetaTagsUntilIndex]
      flushedErrorMetaTagsUntilIndex++

      if (isNotFoundError(error)) {
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
              httpEquiv="refresh"
              content={`${isPermanent ? 0 : 1};url=${redirectUrl}`}
              key={error.digest}
            />
          )
        }
      }
    }

    const stream = await renderToReadableStream(
      <>
        {
          /* Insert the polyfills if they haven't been flushed yet. */
          hasUnflushedPolyfills &&
            polyfills.map((polyfill) => {
              return <script key={polyfill.src} {...polyfill} />
            })
        }
        {renderServerInsertedHTML()}
        {errorMetaTags}
      </>
    )

    hasUnflushedPolyfills = false

    // Wait for the stream to be ready.
    await stream.allReady

    return streamToString(stream)
  }
}
