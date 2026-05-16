'use client'

import './global.css'
import styles from './styles.module.css'

export default function Page() {
  return (
    <main>
      <p id="global">Hello World</p>
      <p id="module" className={styles.module}>
        Hello World
      </p>
    </main>
  )
}
