'use client'

import 'next/link'

import './client-page.css'
import styles from './inner/ClientComponent.module.css'

export default function Page() {
  return (
    <>
      <h1>Page!!!</h1>
      <div id="css-modules" className={styles.yuge}>
        huge
      </div>
    </>
  )
}
