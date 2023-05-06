import styles from './style.module.css'

export default function Template({ children }) {
  return (
    <>
      <h1 className={styles.red}>
        Template <span id="performance-now">{performance.now()}</span>
      </h1>
      {children}
    </>
  )
}
