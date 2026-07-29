import styles from './lazy-target.module.css'

export const LAZY_MARKER = 'lazy-chunk-marker-9f3a'

export function LazyTarget() {
  return (
    <p id="target" className={styles.target}>
      {LAZY_MARKER}
    </p>
  )
}
