import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import styles from '../styles/shared.module.css'

export default function Page() {
  const { data } = useSWR('swr-index', (v) => v, { fallbackData: 'swr-index' })
  return (
    <>
      <p className={styles.content}>hello from pages/index</p>
      <Link href="/dashboard">Dashboard</Link>
      <div>{data}</div>
    </>
  )
}
