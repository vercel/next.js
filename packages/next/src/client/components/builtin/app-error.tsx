import React from 'react'
import { errorStyles, errorThemeCss, WarningIcon } from './error-styles'

// This is the static 500.html page for App Router apps.
// Always a server error, rendered at build time.
function AppError() {
  return (
    <html id="__next_error__">
      <head>
        <title>500: This page couldn&apos;t load</title>
        <style dangerouslySetInnerHTML={{ __html: errorThemeCss }} />
      </head>
      <body>
        <div style={errorStyles.container}>
          <div style={errorStyles.card}>
            <WarningIcon />
            <h1 style={errorStyles.title}>This page couldn&apos;t load</h1>
            <p style={errorStyles.message}>
              There was a server error. Try reloading.
            </p>
            <div style={errorStyles.buttonGroup}>
              <form style={errorStyles.form}>
                <button type="submit" style={errorStyles.button}>
                  Reload
                </button>
              </form>
              <button
                type="button"
                id="back-btn"
                style={errorStyles.buttonSecondary}
              >
                Back
              </button>
            </div>
          </div>
        </div>
        <p id="digest" style={errorStyles.digestFooter} />
        <script
          dangerouslySetInnerHTML={{
            __html:
              'document.getElementById("back-btn").onclick=function(){history.length>1?history.back():location.href="/"}',
          }}
        />
      </body>
    </html>
  )
}

export default AppError
