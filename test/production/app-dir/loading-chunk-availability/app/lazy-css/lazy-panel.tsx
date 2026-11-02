'use client'

import styles from './lazy.module.css'

export default function LazyPanel() {
  return (
    <p id="lazy-panel" className={styles.lazy}>
      panel
    </p>
  )
}
