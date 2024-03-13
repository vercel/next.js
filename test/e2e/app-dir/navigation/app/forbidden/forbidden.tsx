import styles from './style.module.css'

export default function Forbidden() {
  return (
    <>
      <h1 id="forbidden-component" className={styles.red}>
        Forbidden!
      </h1>
    </>
  )
}
