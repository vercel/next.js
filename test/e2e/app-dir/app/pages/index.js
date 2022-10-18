import Link from 'next/link'
import styles from '../styles/shared.module.css'

export default function Page(props) {
  return (
    <>
      <p className={styles.content}>hello from pages/index</p>
      <Link href="/dashboard">Dashboard</Link>
    </>
  )
}
