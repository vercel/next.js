import { useState } from 'react'
import styles from './dynamic.module.css'

export default function Dynamic() {
  let [state] = useState('next dynamic')
  return (
    <p id="css-text-dynamic" className={styles.dynamic}>
      hello from modern the {state}
    </p>
  )
}
