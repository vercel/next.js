'use client'

import { useState } from 'react'
import styles from './style.module.css'

export default function Template({ children }) {
  const [count, setCount] = useState(0)
  return (
    <>
      <h1>Template {count}</h1>
      <button className={styles.button} onClick={() => setCount(count + 1)}>
        Increment
      </button>
      {children}
    </>
  )
}
