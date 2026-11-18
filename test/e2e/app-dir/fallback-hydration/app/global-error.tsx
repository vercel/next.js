'use client'

import styles from './global-error.module.css'

export default function GlobalError({ error }: { error: Error }) {
  return (
    <html>
      <body>
        <h1 id="global-error-title">Custom fallback recovery error</h1>
        <p id="global-error-message" className={styles.message}>
          {error.message}
        </p>
      </body>
    </html>
  )
}
