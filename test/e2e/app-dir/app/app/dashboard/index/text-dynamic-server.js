import styles from './dynamic.module.css'

export default function Dynamic() {
  return (
    <p id="css-text-dynamic-server" className={styles.dynamic}>
      hello from dynamic on server
    </p>
  )
}
