'use client'

import { HandleISRError } from '../handle-isr-error'

const styles = {
  container: {
    fontFamily:
      'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  content: {
    maxWidth: '420px',
    padding: '0 24px',
  },
  icon: {
    marginBottom: '20px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: '#dc2626',
    margin: '0 0 12px 0',
  },
  message: {
    fontSize: '15px',
    fontWeight: 400,
    lineHeight: 1.6,
    color: '#64748b',
    margin: '0 0 16px 0',
  },
  digest: {
    fontSize: '13px',
    fontWeight: 400,
    color: '#94a3b8',
    margin: '0 0 24px 0',
    fontFamily:
      'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '0.01em',
    color: '#fff',
    backgroundColor: '#dc2626',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  devHint: {
    fontSize: '12px',
    fontWeight: 400,
    color: '#9ca3af',
    margin: '24px 0 0 0',
  },
} as const

/* CSS minified from
body { margin: 0; color: #000; background: #fff; }
@media (prefers-color-scheme: dark) {
  body { color: #fff; background: #0a0a0a; }
  .next-error-message { color: #a1a1aa; }
  .next-error-digest { color: #71717a; }
  .next-error-dev-hint { color: #71717a; }
  .next-error-icon-ring { stroke: #7f1d1d; }
  .next-error-icon-fill { fill: #1c1917; }
}
*/
const themeCss = `body{margin:0;color:#000;background:#fff}@media(prefers-color-scheme:dark){body{color:#fff;background:#0a0a0a}.next-error-message{color:#a1a1aa}.next-error-digest{color:#71717a}.next-error-dev-hint{color:#71717a}.next-error-icon-ring{stroke:#7f1d1d}.next-error-icon-fill{fill:#1c1917}}`

function ErrorIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      style={styles.icon}
    >
      <circle
        className="next-error-icon-ring"
        cx="24"
        cy="24"
        r="23"
        stroke="#fecaca"
        strokeWidth="2"
      />
      <circle
        className="next-error-icon-fill"
        cx="24"
        cy="24"
        r="20"
        fill="#fef2f2"
      />
      <path
        d="M24 14v12M24 30v4"
        stroke="#dc2626"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export type GlobalErrorComponent = React.ComponentType<{
  error: any
}>

function DefaultGlobalError({ error }: { error: any }) {
  const digest: string | undefined = error?.digest
  const isServerError = !!digest

  return (
    <html id="__next_error__">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body>
        <HandleISRError error={error} />
        <div style={styles.container}>
          <div style={styles.content}>
            <ErrorIcon />
            <h1 style={styles.title}>An Error Occurred</h1>
            <p className="next-error-message" style={styles.message}>
              Something went wrong. Please try again.
            </p>
            {digest && (
              <p className="next-error-digest" style={styles.digest}>
                Error ID: {digest}
              </p>
            )}
            <button
              style={styles.button}
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
            <p className="next-error-dev-hint" style={styles.devHint}>
              Developers: Check your {isServerError ? 'server logs' : 'browser console'} for details.
            </p>
          </div>
        </div>
      </body>
    </html>
  )
}

// Exported so that the import signature in the loaders can be identical to user
// supplied custom global error signatures.
export default DefaultGlobalError
