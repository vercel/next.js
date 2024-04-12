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
        const escapedRedirectUrl =
          escapeStringForDangerousInsertion(redirectUrl)
        const statusCode = getRedirectStatusCodeFromError(error)
        const isPermanent =
          statusCode === RedirectStatusCode.PermanentRedirect ? true : false
        if (escapedRedirectUrl) {
          // If a streaming redirect is detected, we need to insert a meta tag to redirect the page, so that
          // bots can follow the redirect (since a 200 status code has already been sent). We insert a script tag
          // to only perform the redirect if client-side hydration hasn't happened yet, to prevent a double redirect.
          // The client router also has handling to abort the SPA nav if the meta tag has been inserted into the DOM.
          // We also insert a noscript tag to handle the case where JavaScript is disabled.
          //
          // The original source code for the compiled code below is as follows:
          /*
            if (!window.next) {
              const element = document.createElement("meta");
              element.httpEquiv = "refresh";
              element.id = "__next-page-redirect";
              element.content = `${isPermanent ? 0 : 1};url=" + ${escapedRedirectUrl}`;
              document.head.appendChild(element);
            }
          */
          errorMetaTags.push(
            <React.Fragment key={error.digest}>
              <script
                type="text/javascript"
                dangerouslySetInnerHTML={{
                  __html: `if(!window.next){const a=document.createElement("meta");a.id="__next-page-redirect";a.httpEquiv="refresh";a.content="${
                    isPermanent ? 0 : 1
                  };url=" + ${escapedRedirectUrl};document.head.appendChild(a)};`,
                }}
              />
              <noscript>
                <meta
                  httpEquiv="refresh"
                  content={`${isPermanent ? 0 : 1};url=${redirectUrl}`}
                />
              </noscript>
            </React.Fragment>
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

/**
 * Allows us to escape the redirect string that are used in the `dangerouslySetInnerHTML` above.
 * The implementation below is lifted from React Fizz's implementation.
 * https://github.com/facebook/react/blob/374b5d26c2a379fe87ee6817217c8956c4e39aac/packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js#L4359
 *
 */
function escapeStringForDangerousInsertion(input: string): string {
  const escapeRegex = /[<\u2028\u2029]/g
  const escaped = JSON.stringify(input)
  return escaped.replace(escapeRegex, (match) => {
    switch (match) {
      // santizing breaking out of strings and script tags
      case '<':
        return '\\u003c'
      case '\u2028':
        return '\\u2028'
      case '\u2029':
        return '\\u2029'
      default: {
        throw new Error(
          'escapeStringForDangerousInsertion encountered a match it does not know how to replace.'
        )
      }
    }
  })
}
