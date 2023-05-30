import React from 'react'
import Link from 'next/link'
import styles from '../styles/shared.module.css'

export default function Page() {
  return (
    <>
      <p id="hello" className={styles.content}>
        hello from pages/index
      </p>
      <Link href="/dashboard">Dashboard</Link>
      <p id="react-version">{React.version}</p>
    </>
  )
}
