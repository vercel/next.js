import Link from 'next/link'
import styles from './style.module.css'

export const metadata = {
  title: 'Home Page',
}

export default function Home() {
  return (
    <main id="main" className={styles.bgBlue}>
      <p>Main</p>
      <Link href="/nested">Nested Page</Link>
    </main>
  )
}
