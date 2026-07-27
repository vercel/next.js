import React from 'react'
import { errorStyles, errorThemeCss, WarningIcon } from './error-styles'

// This is the static 500.html page for App Router apps.
// Always a server error, rendered at build time.
function AppError() {
  return (
    <html id="__next_error__">
      <head>
        <title>500: This page couldn&#x2019;t load</title>
        <style dangerouslySetInnerHTML={{ __html: errorThemeCss }} />
      </head>
      <body>
        <div style={errorStyles.container}>
          <div style={errorStyles.card}>
            <WarningIcon />
            <h1 style={errorStyles.title}>This page couldn&#x2019;t load</h1>
            <p style={errorStyles.message}>
              A server error occurred. Reload to try again.
            </p>
            <form style={errorStyles.form}>
              <button type="submit" style={errorStyles.button}>
                Reload
              </button>
            </form>
          </div>
        </div>
      </body>
    </html>
  )
}

export default AppError
