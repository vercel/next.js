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
  },
  card: {
    maxWidth: '420px',
    padding: '32px 28px',
    textAlign: 'left' as const,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: '12px',
  },
  icon: {
    marginBottom: '16px',
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: '#171717',
    margin: '0 0 8px 0',
  },
  message: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: 1.6,
    color: '#666666',
    margin: '0 0 6px 0',
  },
  messageHint: {
    fontSize: '13px',
    fontWeight: 400,
    lineHeight: 1.5,
    color: '#8f8f8f',
    margin: '0 0 20px 0',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '0.01em',
    color: '#171717',
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  digestContainer: {
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(0,0,0,0.06)',
  },
  digest: {
    fontSize: '12px',
    fontWeight: 400,
    color: '#a0a0a0',
    margin: '0 0 2px 0',
  },
  digestCode: {
    fontFamily:
      'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace',
    fontSize: '11px',
    color: '#8f8f8f',
    userSelect: 'all' as const,
  },
  digestHint: {
    fontSize: '11px',
    fontWeight: 400,
    color: '#b0b0b0',
    margin: '4px 0 0 0',
  },
} as const

/* CSS minified from
body { margin: 0; color: #171717; background: #fff; }
@media (prefers-color-scheme: dark) {
  body { color: #ededed; background: #0a0a0a; }
  .next-error-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
  .next-error-title { color: #ededed; }
  .next-error-message { color: #a0a0a0; }
  .next-error-message-hint { color: #707070; }
  .next-error-digest { color: #606060; }
  .next-error-digest-code { color: #707070; }
  .next-error-digest-hint { color: #505050; }
  .next-error-digest-container { border-color: rgba(255,255,255,0.08); }
  .next-error-icon-ring { stroke: #5c2121; }
  .next-error-icon-fill { fill: #2a1618; }
  .next-error-button { background: #1a1a1a; color: #ededed; border-color: #333; }
}
*/
const themeCss = `body{margin:0;color:#171717;background:#fff}@media(prefers-color-scheme:dark){body{color:#ededed;background:#0a0a0a}.next-error-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}.next-error-title{color:#ededed}.next-error-message{color:#a0a0a0}.next-error-message-hint{color:#707070}.next-error-digest{color:#606060}.next-error-digest-code{color:#707070}.next-error-digest-hint{color:#505050}.next-error-digest-container{border-color:rgba(255,255,255,0.08)}.next-error-icon-ring{stroke:#5c2121}.next-error-icon-fill{fill:#2a1618}.next-error-button{background:#1a1a1a;color:#ededed;border-color:#333}}`

function ErrorIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      style={styles.icon}
    >
      <circle
        className="next-error-icon-ring"
        cx="20"
        cy="20"
        r="19"
        stroke="#fecaca"
        strokeWidth="2"
      />
      <circle
        className="next-error-icon-fill"
        cx="20"
        cy="20"
        r="16"
        fill="#fef2f2"
      />
      <path
        d="M20 11v10M20 25v3"
        stroke="#dc2626"
        strokeWidth="2.5"
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

  return (
    <html id="__next_error__">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body>
        <HandleISRError error={error} />
        <div style={styles.container}>
          <div className="next-error-card" style={styles.card}>
            <ErrorIcon />
            <h1 className="next-error-title" style={styles.title}>
              Something went wrong
            </h1>
            <p className="next-error-message" style={styles.message}>
              This page failed to load.
            </p>
            <p className="next-error-message-hint" style={styles.messageHint}>
              Reloading usually fixes this. If it keeps happening, the page may
              be temporarily unavailable.
            </p>
            <form>
              <button
                className="next-error-button"
                type="submit"
                style={styles.button}
              >
                Reload page
              </button>
            </form>
            {digest && (
              <div
                className="next-error-digest-container"
                style={styles.digestContainer}
              >
                <p className="next-error-digest" style={styles.digest}>
                  Error reference:{' '}
                  <code
                    className="next-error-digest-code"
                    style={styles.digestCode}
                  >
                    {digest}
                  </code>
                </p>
                <p className="next-error-digest-hint" style={styles.digestHint}>
                  Include this if you contact support.
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
