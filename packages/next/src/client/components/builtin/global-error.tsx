'use client'

import React from 'react'
import { handleISRError } from '../handle-isr-error'
import { errorStyles, errorThemeCss, WarningIcon } from './error-styles'

export type GlobalErrorComponent = React.ComponentType<{
  error: any
  reset: () => void
  unstable_retry: () => void
}>

function DefaultGlobalError({ error }: { error: any }) {
  const digest: string | undefined = error?.digest
  const isServerError = !!digest

  const message = isServerError
    ? 'A server error occurred. Reload to try again.'
    : 'Reload to try again, or go back.'

  handleISRError({ error })

  return (
    <html id="__next_error__">
      <head>
        <style dangerouslySetInnerHTML={{ __html: errorThemeCss }} />
      </head>
      <body>
        <div style={errorStyles.container}>
          <div style={errorStyles.card}>
            <WarningIcon />
            <h1 style={errorStyles.title}>This page couldn&#x2019;t load</h1>
            <p style={errorStyles.message}>{message}</p>
            <div style={errorStyles.buttonGroup}>
              <form style={errorStyles.form}>
                <button type="submit" style={errorStyles.button}>
                  Reload
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
                  Back
                </button>
              )}
            </div>
          </div>
        </div>
        {digest && <p style={errorStyles.digestFooter}>ERROR {digest}</p>}
      </body>
    </html>
  )
}

// Exported so that the import signature in the loaders can be identical to user
// supplied custom global error signatures.
export default DefaultGlobalError
