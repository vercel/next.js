'use client'

import { useState } from 'react'
import styles from './counter.module.css'

export function Counter({ id }: { id: string }) {
  const [count, setCount] = useState(0)
  return (
    <button
      id={id}
      className={styles.counter}
      onClick={() => setCount((c) => c + 1)}
    >
      {id}: {count}
    </button>
  )
}
