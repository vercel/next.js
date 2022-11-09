import Link from 'next/link'
import styles from '../styles.module.css'

export default function About() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>About Page</h1>
        <hr className={styles.hr} />
        <Link href="/">&larr; Back home</Link>
      </div>
    </div>
  )
}
