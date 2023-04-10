'use client'

import { useState } from 'react'
import styles from './dynamic.module.css'

export default function Dynamic({ name }) {
  let [state] = useState('dynamic no ssr on client' + name)
  return (
    <p id="css-text-dynamic-no-ssr-client" className={styles.dynamic}>
      {`next-dynamic ${state}`}
    </p>
  )
}
