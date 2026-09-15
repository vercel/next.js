import styles from './a.module.css'
import title from './b.module.css'
import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <p id="home" className={`${styles.banner} ${title.title}`}>
        home
      </p>
      <Link href="/other">other</Link>
    </main>
  )
}
