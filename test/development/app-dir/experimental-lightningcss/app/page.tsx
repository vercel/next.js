import styles from './style.module.css'

export default function Page() {
  console.log(styles)
  return <p className={`search-keyword ${styles.blue}`}>hello world</p>
}
