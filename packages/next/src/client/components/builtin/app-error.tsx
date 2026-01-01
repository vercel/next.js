import React from 'react'

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
}

/* CSS minified from
body { margin: 0; color: #171717; background: #fff; }
@media (prefers-color-scheme: dark) {
  body { color: #ededed; background: #0a0a0a; }
  .next-error-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
  .next-error-title { color: #ededed; }
  .next-error-message { color: #a0a0a0; }
  .next-error-message-hint { color: #707070; }
  .next-error-icon-ring { stroke: #5c2121; }
  .next-error-icon-fill { fill: #2a1618; }
  .next-error-button { background: #1a1a1a; color: #ededed; border-color: #333; }
}
*/
const themeCss = `body{margin:0;color:#171717;background:#fff}@media(prefers-color-scheme:dark){body{color:#ededed;background:#0a0a0a}.next-error-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}.next-error-title{color:#ededed}.next-error-message{color:#a0a0a0}.next-error-message-hint{color:#707070}.next-error-icon-ring{stroke:#5c2121}.next-error-icon-fill{fill:#2a1618}.next-error-button{background:#1a1a1a;color:#ededed;border-color:#333}}`

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

function AppError() {
  return (
    <html id="__next_error__">
      <head>
        <title>500: Internal Server Error</title>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body>
        <div style={styles.container}>
          <div className="next-error-card" style={styles.card}>
            <ErrorIcon />
            <h1 className="next-error-title" style={styles.title}>
              Something went wrong
            </h1>
            <p className="next-error-message" style={styles.message}>
              The server encountered an error.
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
          </div>
        </div>
      </body>
    </html>
  )
}

export default AppError
