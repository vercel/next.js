import styles from './style.module.css'

export default function RedText({ children }) {
  return <div className={styles.text}>{children}</div>
}
