import Link from 'next/link'
import styles from './page.module.css'

export default function Example() {
  return (
    <div>
      <h1>Example</h1>
      <p className={styles.red} id="red-text">
        This is red
      </p>
      <p>
        <Link href="/default-css/more">Show more</Link>
      </p>
    </div>
  )
}
