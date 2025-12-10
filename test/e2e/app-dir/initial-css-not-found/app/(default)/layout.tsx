import type { ReactNode } from 'react'
import styles from '../styles.module.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={styles.foo}>{children}</body>
    </html>
  )
}
