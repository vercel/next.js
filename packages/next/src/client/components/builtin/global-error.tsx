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
    borderRadius: '12px',
    background: 'var(--next-error-card-bg)',
    border: 'var(--next-error-card-border)',
  },
  icon: {
    marginBottom: '16px',
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    margin: '0 0 8px 0',
    color: 'var(--next-error-title)',
  },
  message: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: 1.6,
    margin: '0 0 6px 0',
    color: 'var(--next-error-message)',
  },
  messageHint: {
    fontSize: '13px',
    fontWeight: 400,
    lineHeight: 1.5,
    margin: '0 0 20px 0',
    color: 'var(--next-error-hint)',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '0.01em',
    borderRadius: '6px',
    cursor: 'pointer',
    color: 'var(--next-error-btn-text)',
    background: 'var(--next-error-btn-bg)',
    border: 'var(--next-error-btn-border)',
  },
  digestContainer: {
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: 'var(--next-error-digest-border)',
  },
  digest: {
    fontSize: '12px',
    fontWeight: 400,
    margin: '0',
    color: 'var(--next-error-digest)',
  },
  digestCode: {
    fontFamily:
      'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace',
    fontSize: '11px',
    color: 'var(--next-error-digest-code)',
    userSelect: 'all' as const,
  },
} as const

/* CSS variables for theming */
const themeCss = `
:root {
  --next-error-bg: #fff;
  --next-error-text: #171717;
  --next-error-card-bg: transparent;
  --next-error-card-border: none;
  --next-error-title: #171717;
  --next-error-message: #666;
  --next-error-hint: #888;
  --next-error-digest: #999;
  --next-error-digest-code: #888;
  --next-error-digest-border: 1px solid rgba(0,0,0,0.06);
  --next-error-btn-text: #171717;
  --next-error-btn-bg: #fff;
  --next-error-btn-border: 1px solid #e5e5e5;
  --next-error-icon-ring: #fecaca;
  --next-error-icon-fill: #fef2f2;
}
@media (prefers-color-scheme: dark) {
  :root {
    --next-error-bg: #0a0a0a;
    --next-error-text: #ededed;
    --next-error-title: #ededed;
    --next-error-message: #a0a0a0;
    --next-error-hint: #707070;
    --next-error-digest: #606060;
    --next-error-digest-code: #707070;
    --next-error-digest-border: 1px solid rgba(255,255,255,0.08);
    --next-error-btn-text: #ededed;
    --next-error-btn-bg: #1a1a1a;
    --next-error-btn-border: 1px solid #333;
    --next-error-icon-ring: #5c2121;
    --next-error-icon-fill: #2a1618;
  }
}
body { margin: 0; color: var(--next-error-text); background: var(--next-error-bg); }
`.replace(/\n\s*/g, '')

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
        cx="20"
        cy="20"
        r="19"
        stroke="var(--next-error-icon-ring)"
        strokeWidth="2"
      />
      <circle cx="20" cy="20" r="16" fill="var(--next-error-icon-fill)" />
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
          <div style={styles.card}>
            <ErrorIcon />
            <h1 style={styles.title}>Something went wrong</h1>
            <p style={styles.message}>This page failed to load.</p>
            <p style={styles.messageHint}>
              Reloading usually fixes this. If it keeps happening, the page may
              be temporarily unavailable.
            </p>
            <form>
              <button type="submit" style={styles.button}>
                Reload page
              </button>
            </form>
            {digest && (
              <div style={styles.digestContainer}>
                <p style={styles.digest}>
                  Error reference:{' '}
                  <code style={styles.digestCode}>{digest}</code>
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
