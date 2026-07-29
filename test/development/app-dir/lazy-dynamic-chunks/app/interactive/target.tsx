import styles from './target.module.css'

export const INTERACTIVE_MARKER = 'interactive-chunk-marker-2e8b'

export function InteractiveTarget() {
  return (
    <p id="target" className={styles.target}>
      {INTERACTIVE_MARKER}
    </p>
  )
}
