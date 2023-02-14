import styles from './style.module.css'

export default function Layout({ children }) {
  return <div className={styles.foo}>{children}</div>
}
