import styles from './app-only-lazy.module.css'

export default function AppOnlyLazy() {
  return (
    <p id="app-only-lazy" className={styles.box}>
      app-only lazy component
    </p>
  )
}
