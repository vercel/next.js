import React from 'react'
import styles from './innerWrapper.module.css'

export default function InnerWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className={styles.innerWrapper}>{children}</div>
}
