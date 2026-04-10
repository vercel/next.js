import styles from './styles.module.css'

export default function Page() {
  const keys = Object.keys(styles).sort()
  return (
    <div>
      <p id="keys">{keys.join(',')}</p>
      <p id="main" className={styles.mainContent}>
        main
      </p>
      <p id="nav" className={styles.navBar}>
        nav
      </p>
      <p id="simple" className={styles.simple}>
        simple
      </p>
      <p id="underscore" className={styles.withUnderscore}>
        underscore
      </p>
    </div>
  )
}
