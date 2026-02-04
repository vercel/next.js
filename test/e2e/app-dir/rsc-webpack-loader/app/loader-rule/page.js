'use client'

import styles from './a.module.css!=!./a.txt'

export default function Home() {
  return (
    <div id="red" className={styles.red}>
      Red
    </div>
  )
}
