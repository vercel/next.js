'use client'

import { HandleISRError } from '../handle-isr-error'

const styles = {
  error: {
    // https://github.com/sindresorhus/modern-normalize/blob/main/modern-normalize.css#L38-L52
    fontFamily:
      'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
    height: '100vh',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '28px',
    margin: '0 8px',
  },
} as const

export type GlobalErrorComponent = React.ComponentType<{
  error: any
}>
function DefaultGlobalError({ error }: { error: any }) {
  const digest: string | undefined = error?.digest
  return (
    <html id="__next_error__">
      <head></head>
      <body>
        <HandleISRError error={error} />
        <div style={styles.error}>
          <div>
            <h2 style={styles.text}>
              Application error: a {digest ? 'server' : 'client'}-side exception
              has occurred while loading {window.location.hostname} (see the{' '}
              {digest ? 'server logs' : 'browser console'} for more
              information).
            </h2>
            {digest ? <p style={styles.text}>{`Digest: ${digest}`}</p> : null}
          </div>
        </div>
      </body>
    </html>
  )
}

// Exported so that the import signature in the loaders can be identical to user
// supplied custom global error signatures.
export default DefaultGlobalError
