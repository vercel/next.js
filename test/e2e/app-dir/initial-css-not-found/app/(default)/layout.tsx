import { ReactNode } from 'react'
import styles from '@/app/styles.module.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body className={styles.foo}>{children}</body>
    </html>
  )
}
