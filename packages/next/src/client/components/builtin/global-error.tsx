'use client'

import { HandleISRError } from '../handle-isr-error'
import { errorStyles, errorThemeCss, ErrorIcon } from './error-styles'

export type GlobalErrorComponent = React.ComponentType<{
  error: any
}>

function DefaultGlobalError({ error }: { error: any }) {
  const digest: string | undefined = error?.digest
  const isServerError = !!digest

  // Server error: "This page failed to load"
  // Client error: "This page crashed"
  const title = isServerError ? 'This page failed to load' : 'This page crashed'
  const message = isServerError
    ? 'Something went wrong while loading this page.'
    : 'An error occurred while running this page.'
  const hint = isServerError
    ? 'If this keeps happening, it may be a server issue.'
    : null

  return (
    <html id="__next_error__">
      <head>
        <style dangerouslySetInnerHTML={{ __html: errorThemeCss }} />
      </head>
      <body>
        <HandleISRError error={error} />
        <div style={errorStyles.container}>
          <div style={errorStyles.card}>
            <ErrorIcon />
            <h1 style={errorStyles.title}>{title}</h1>
            <p style={errorStyles.message}>{message}</p>
            {hint && <p style={errorStyles.messageHint}>{hint}</p>}
            {!isServerError && (
              <p style={errorStyles.messageHint}>
                Reloading usually fixes this.
              </p>
            )}
            <div style={errorStyles.buttonGroup}>
              <form>
                <button type="submit" style={errorStyles.button}>
                  Reload page
                </button>
              </form>
              {!isServerError && (
                <button
                  type="button"
                  style={errorStyles.buttonSecondary}
                  onClick={() => {
                    if (window.history.length > 1) {
                      window.history.back()
                    } else {
                      window.location.href = '/'
                    }
                  }}
                >
                  Go back
                </button>
              )}
            </div>
            {digest && (
              <div style={errorStyles.digestContainer}>
                <p style={errorStyles.digest}>
                  Error reference:{' '}
                  <code style={errorStyles.digestCode}>{digest}</code>
                </p>
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}

// Exported so that the import signature in the loaders can be identical to user
// supplied custom global error signatures.
export default DefaultGlobalError
