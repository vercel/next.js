import { PropsWithChildren } from 'react'
import styles from './code.module.css'

export default function Code(props: PropsWithChildren) {
  return <code className={styles.root} {...props} />
}
