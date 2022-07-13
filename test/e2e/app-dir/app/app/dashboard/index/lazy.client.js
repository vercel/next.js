import styles from './lazy.module.css'

export default function LazyComponent() {
  return (
    <>
      <p className={styles.lazy}>hello from lazy</p>
    </>
  )
}
