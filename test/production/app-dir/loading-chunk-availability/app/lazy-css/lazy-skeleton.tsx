'use client'

import styles from './lazy.module.css'

export function LazySkeleton() {
  return (
    <p id="lazy-skeleton" className={styles.lazy}>
      loading
    </p>
  )
}
