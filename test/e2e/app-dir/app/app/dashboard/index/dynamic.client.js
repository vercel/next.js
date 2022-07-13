import { useState } from 'react'
import styles from './dynamic.module.css'

export default function Dynamic() {
  let [state] = useState('next dynamic')
  return <p className={styles.dynamic}>hello from modern the {state}</p>
}
