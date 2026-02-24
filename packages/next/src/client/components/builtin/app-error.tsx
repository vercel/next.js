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
            <p style={{ ...errorStyles.message, margin: '0 0 20px 0' }}>
              Try reloading or go back.
            </p>
            <div style={errorStyles.buttonGroup}>
              <form style={{ margin: 0 }}>
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
