import Link from 'next/link'
import styles from './style.module.css'

export default function NotFound() {
  return (
    <>
      <h1 id="not-found-component" className={styles.red}>
        Not Found!
      </h1>
      <Link href="/not-found/result" id="to-result">
        To Result
      </Link>
    </>
  )
}
