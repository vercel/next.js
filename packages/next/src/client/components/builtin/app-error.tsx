import React from 'react'
import { errorStyles, errorThemeCss, ErrorIcon } from './error-styles'

// This is the static 500.html page for App Router apps.
// Always a server error, rendered at build time.
function AppError() {
  return (
    <html id="__next_error__">
      <head>
        <title>500: This page failed to load</title>
        <style dangerouslySetInnerHTML={{ __html: errorThemeCss }} />
      </head>
      <body>
        <div style={errorStyles.container}>
          <div style={errorStyles.card}>
            <ErrorIcon />
            <h1 style={errorStyles.title}>This page failed to load</h1>
            <p style={errorStyles.message}>
              Something went wrong while loading this page.
            </p>
            <p style={errorStyles.messageHint}>
              If this keeps happening, it may be a server issue.
            </p>
            <form>
              <button type="submit" style={errorStyles.button}>
                Reload page
              </button>
            </form>
          </div>
        </div>
      </body>
    </html>
  )
}

export default AppError
