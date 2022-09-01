import { HTMLAttributes } from 'react'
import styles from './code.module.css'

type CodeProps = Omit<HTMLAttributes<HTMLDivElement>, 'className'>

export default function Code(props: CodeProps) {
  return <code className={styles.root} {...props} />
}
