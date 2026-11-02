'use client'

import './loading-only.css'
import styles from './shared.module.css'

export function CssSkeleton() {
  return (
    <p id="css-skeleton" className={styles.shared}>
      loading
    </p>
  )
}
