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
        let encodedRedirectPathname: string | undefined

        try {
          encodedRedirectPathname = encodeURIComponent(
            new URL(redirectUrl, 'http://n').pathname
          )
        } catch (err) {
          console.error(`Failed to parse redirect URL: ${redirectUrl}`)
        }

        const statusCode = getRedirectStatusCodeFromError(error)
        const isPermanent =
          statusCode === RedirectStatusCode.PermanentRedirect ? true : false
        if (encodedRedirectPathname) {
          // If a streaming redirect is detected, we need to insert a meta tag to redirect the page, so that
          // bots can follow the redirect (since a 200 status code has already been sent). We insert a script tag
          // to only perform the redirect if the client hasn't already handled it, to prevent a double redirect.
          // The client router also has handling to abort the SPA nav if the meta tag has been inserted into the DOM.
          // The script then removes itself from the DOM.
          // We also insert a noscript tag to handle the case where JavaScript is disabled.
          errorMetaTags.push(
            <div key={error.digest} id="__next-page-redirect-wrapper">
              <script
                type="text/javascript"
                dangerouslySetInnerHTML={{
                  __html: `
                  (function() {
                    const encodedRedirectPathname = "${encodedRedirectPathname}";
                    const redirectPathname = decodeURIComponent(encodedRedirectPathname);
                    const currentPathname = decodeURIComponent(window.location.pathname);
                    if (currentPathname !== redirectPathname) {
                      const element = document.createElement("meta");
                      element.id = "__next-page-redirect";
                      element.httpEquiv = "refresh";
                      element.content = "${
                        isPermanent ? 0 : 1
                      };url=" + redirectPathname;
                      document.head.appendChild(element);
                    } else {
                      const wrapper = document.getElementById("__next-page-redirect-wrapper");
                      if (wrapper && wrapper.parentNode) {
                        wrapper.parentNode.removeChild(wrapper);
                      }
                    }
                  })();
                `,
                }}
              />
              <noscript>
                <meta
                  id="__next-page-redirect"
                  httpEquiv="refresh"
                  content={`${isPermanent ? 0 : 1};url=${redirectUrl}`}
                />
              </noscript>
            </div>
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
