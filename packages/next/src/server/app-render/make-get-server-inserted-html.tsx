import React from 'react'
import { isNotFoundError } from '../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
} from '../../client/components/redirect'
import { getRedirectStatusCodeFromError } from '../../client/components/get-redirect-status-code-from-error'
import { renderToString } from './render-to-string'

export function makeGetServerInsertedHTML({
  polyfills,
  renderServerInsertedHTML,
}: {
  polyfills: JSX.IntrinsicElements['script'][]
  renderServerInsertedHTML: () => React.ReactNode
}) {
  let flushedErrorMetaTagsUntilIndex = 0
  let polyfillsFlushed = false

  return function getServerInsertedHTML(serverCapturedErrors: Error[]) {
    // Loop through all the errors that have been captured but not yet
    // flushed.
    const errorMetaTags = []
    for (
      ;
      flushedErrorMetaTagsUntilIndex < serverCapturedErrors.length;
      flushedErrorMetaTagsUntilIndex++
    ) {
      const error = serverCapturedErrors[flushedErrorMetaTagsUntilIndex]

      if (isNotFoundError(error)) {
        errorMetaTags.push(
          <meta name="robots" content="noindex" key={error.digest} />,
          process.env.NODE_ENV === 'development' ? (
            <meta name="next-error" content="not-found" key="next-error" />
          ) : null
        )
      } else if (isRedirectError(error)) {
        const redirectUrl = getURLFromRedirectError(error)
        const isPermanent =
          getRedirectStatusCodeFromError(error) === 308 ? true : false
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

    const flushed = renderToString({
      ReactDOMServer: require('react-dom/server.edge'),
      element: (
        <>
          {polyfillsFlushed
            ? null
            : polyfills?.map((polyfill) => {
                return <script key={polyfill.src} {...polyfill} />
              })}
          {renderServerInsertedHTML()}
          {errorMetaTags}
        </>
      ),
    })
    polyfillsFlushed = true
    return flushed
  }
}
