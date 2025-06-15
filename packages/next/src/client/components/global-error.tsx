'use client'

import { HandleISRError } from './handle-isr-error'
import { globalErrorStyles as styles } from './global-error-styles'

export type GlobalErrorComponent = React.ComponentType<{
  error: any
}>
function GlobalError({ error }: { error: any }) {
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
              has occurred while loading{' '}
              {typeof window !== 'undefined' ? window.location.hostname : ''}{' '}
              (see the {digest ? 'server logs' : 'browser console'} for more
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
export default GlobalError
