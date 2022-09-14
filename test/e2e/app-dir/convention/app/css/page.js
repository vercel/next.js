import styles from './styles.module.css'
import { useState } from 'react'

export default function Page() {
  const [text] = useState('error:server + client:useState')
  return <div className={styles.root}>{text}</div>
}
