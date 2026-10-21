import React from 'react'
import Providers from '../Providers'
import styles from '../Shell.module.css'
export default function Layout({ children }) {
  return (
    <html>
      <body>
        <div data-shell="application" className={styles.shell}>
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  )
}
