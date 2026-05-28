'use client'

// Client component imported by App Router pages. Imports a CSS module
// (`counter.module.css`) so that `clientModules` in the per-route
// `_client-reference-manifest.js` references a CSS module entry — and the
// tool must surface its extracted .css file via `entryCSSFiles` for routes
// that transitively import this component.
import { useState } from 'react'
import styles from './counter.module.css'

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button className={styles.btn} onClick={() => setCount(count + 1)}>
      count is {count}
    </button>
  )
}
