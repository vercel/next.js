'use client'

import styles from './lazy.module.css'

export default function LazyComponent() {
  return (
    <>
      <p id="css-text-lazy" className={styles.lazy}>
        next-dynamic lazy
      </p>
    </>
  )
}
