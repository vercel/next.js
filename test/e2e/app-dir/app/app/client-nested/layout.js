'use client'

import { useState, useEffect } from 'react'

import styles from './style.module.css'
import './style.css'

export default function ClientNestedLayout({ children }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(1)
  }, [])
  return (
    <>
      <h1 className={styles.red}>Client Nested. Count: {count}</h1>
      <button onClick={() => setCount(count + 1)}>{count}</button>
      {children}
    </>
  )
}
