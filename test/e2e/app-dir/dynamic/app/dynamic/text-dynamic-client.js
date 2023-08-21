'use client'

import { useState } from 'react'
import styles from './dynamic.module.css'

export default function Dynamic() {
  let [state] = useState('dynamic on client')
  return (
    <p id="css-text-dynamic-client" className={styles.dynamic}>
      {`next-dynamic ${state}`}
    </p>
  )
}
